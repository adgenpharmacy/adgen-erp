"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// GET /api/customers — Fetch all customers with query search (q) & computed credit balance
router.get('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const { q } = req.query;
        const searchStr = typeof q === 'string' ? q.trim() : '';
        const whereClause = {};
        if (searchStr) {
            whereClause.OR = [
                { name: { contains: searchStr, mode: 'insensitive' } },
                { phone: { contains: searchStr, mode: 'insensitive' } },
                { doctorName: { contains: searchStr, mode: 'insensitive' } },
            ];
        }
        let customers = await prisma_1.prisma.customer.findMany({
            where: whereClause,
            include: {
                salesBills: {
                    where: { isSettled: false },
                    select: { grandTotal: true, amountPaid: true },
                },
            },
        });
        if (searchStr) {
            const queryLower = searchStr.toLowerCase();
            customers = customers.sort((a, b) => {
                const aName = (a.name || '').toLowerCase();
                const bName = (b.name || '').toLowerCase();
                const aPhone = (a.phone || '').toLowerCase();
                const bPhone = (b.phone || '').toLowerCase();
                const aStartsWith = aName.startsWith(queryLower) || aPhone.startsWith(queryLower);
                const bStartsWith = bName.startsWith(queryLower) || bPhone.startsWith(queryLower);
                if (aStartsWith && !bStartsWith)
                    return -1;
                if (!aStartsWith && bStartsWith)
                    return 1;
                return aName.localeCompare(bName);
            });
        }
        else {
            customers = customers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        }
        const result = customers.map((c) => {
            const creditBalance = c.salesBills.reduce((sum, bill) => sum + (bill.grandTotal - bill.amountPaid), 0);
            const { salesBills, ...custData } = c;
            return {
                ...custData,
                creditBalance,
            };
        });
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// POST /api/customers — Create customer
router.post('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const { name, phone, email, address, gstNumber, doctorName } = req.body;
        const customer = await prisma_1.prisma.customer.create({
            data: { name, phone, email, address, gstNumber, doctorName },
        });
        res.status(201).json(customer);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// PUT /api/customers/:id — Update customer
router.put('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma_1.prisma.customer.update({
            where: { id },
            data: req.body,
        });
        res.json(updated);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
exports.default = router;
