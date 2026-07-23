"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// GET /api/ledger — Fetch all ledger entries
router.get('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const entries = await prisma_1.prisma.ledgerEntry.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                customer: { select: { id: true, name: true, phone: true } },
                party: { select: { id: true, name: true } },
                salesBill: { select: { id: true, invoiceNumber: true, customerName: true, grandTotal: true, amountPaid: true, isSettled: true } },
                purchaseBill: { select: { id: true, invoiceNumber: true, grandTotal: true, isPaid: true } },
            },
        });
        const existingSalesBillIds = new Set(entries.map(e => e.salesBillId).filter(Boolean));
        const existingPurchaseBillIds = new Set(entries.map(e => e.purchaseBillId).filter(Boolean));
        // Fetch any credit sales bills not in ledger
        const creditSalesBills = await prisma_1.prisma.salesBill.findMany({
            where: {
                OR: [
                    { paymentMethod: 'CREDIT' },
                    { isSettled: false },
                ],
            },
            include: { customer: { select: { id: true, name: true, phone: true } } },
        });
        const syntheticSalesEntries = creditSalesBills
            .filter(b => !existingSalesBillIds.has(b.id))
            .map(b => ({
            id: `synth-sale-${b.id}`,
            partyType: 'CUSTOMER',
            customerId: b.customerId,
            partyId: null,
            transactionType: 'CREDIT',
            amount: b.grandTotal - b.amountPaid,
            description: `Unpaid Credit Sale Invoice #${b.invoiceNumber} (${b.customerName || b.customer?.name || 'Walk-in'})`,
            isSettled: b.isSettled,
            salesBillId: b.id,
            purchaseBillId: null,
            createdAt: b.createdAt,
            updatedAt: b.createdAt,
            customer: b.customer || (b.customerName ? { id: 'anon', name: b.customerName, phone: b.customerPhone || '' } : null),
            party: null,
        }));
        // Fetch any unpaid purchase bills not in ledger
        const unpaidPurchaseBills = await prisma_1.prisma.purchaseBill.findMany({
            where: { isPaid: false },
            include: { party: { select: { id: true, name: true } } },
        });
        const syntheticPurchaseEntries = unpaidPurchaseBills
            .filter(b => !existingPurchaseBillIds.has(b.id))
            .map(b => ({
            id: `synth-pur-${b.id}`,
            partyType: 'SUPPLIER',
            customerId: null,
            partyId: b.partyId,
            transactionType: 'DEBIT',
            amount: b.grandTotal,
            description: `Unpaid Supplier Purchase Bill #${b.invoiceNumber} (${b.party?.name || 'Supplier'})`,
            isSettled: false,
            salesBillId: null,
            purchaseBillId: b.id,
            createdAt: b.createdAt,
            updatedAt: b.createdAt,
            customer: null,
            party: b.party,
        }));
        const allEntries = [...entries, ...syntheticSalesEntries, ...syntheticPurchaseEntries].sort((a, b) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        res.json(allEntries);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// POST /api/ledger/payment — Record customer or supplier debt repayment
router.post('/payment', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const { type, customerId, partyId, amount, notes } = req.body;
        if (!amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Valid payment amount is required' });
        }
        const entry = await prisma_1.prisma.ledgerEntry.create({
            data: {
                partyType: type === 'CUSTOMER' ? 'CUSTOMER' : 'SUPPLIER',
                customerId: type === 'CUSTOMER' ? customerId : null,
                partyId: type === 'PARTY' ? partyId : null,
                transactionType: type === 'CUSTOMER' ? 'DEBIT' : 'CREDIT',
                amount: parseFloat(amount),
                description: notes || `Debt Repayment Settlement (${type})`,
                isSettled: true,
            },
        });
        res.status(201).json(entry);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// POST /api/ledger/settle — Settle a customer or supplier bill payment
router.post('/settle', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const { ledgerId, salesBillId, purchaseBillId, paymentMethod, amountPaid } = req.body;
        await prisma_1.prisma.$transaction(async (tx) => {
            // 1. Mark ledger entry as settled
            if (ledgerId) {
                await tx.ledgerEntry.update({
                    where: { id: ledgerId },
                    data: { isSettled: true },
                });
            }
            // 2. Update Sales Bill if customer payment
            if (salesBillId) {
                const bill = await tx.salesBill.findUnique({ where: { id: salesBillId } });
                if (bill) {
                    const newAmountPaid = bill.amountPaid + parseFloat(amountPaid);
                    const isSettled = newAmountPaid >= bill.grandTotal;
                    await tx.salesBill.update({
                        where: { id: salesBillId },
                        data: {
                            amountPaid: newAmountPaid,
                            isSettled,
                        },
                    });
                }
            }
            // 3. Update Purchase Bill if supplier payment
            if (purchaseBillId) {
                await tx.purchaseBill.update({
                    where: { id: purchaseBillId },
                    data: { isPaid: true },
                });
            }
        });
        res.json({ message: 'Payment settled successfully' });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
exports.default = router;
