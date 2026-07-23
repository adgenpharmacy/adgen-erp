"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// GET /api/parties — Fetch all suppliers with dynamically computed outstanding balance
router.get('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const parties = await prisma_1.prisma.party.findMany({
            orderBy: { name: 'asc' },
            include: {
                purchaseBills: {
                    where: { isPaid: false },
                    select: { grandTotal: true },
                },
            },
        });
        const result = parties.map((p) => {
            const outstandingBalance = p.purchaseBills.reduce((sum, bill) => sum + bill.grandTotal, 0);
            const { purchaseBills, ...partyData } = p;
            return {
                ...partyData,
                outstandingBalance,
            };
        });
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// POST /api/parties — Create supplier
router.post('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const { name, phone, email, address, gstNumber, dlNumber } = req.body;
        const party = await prisma_1.prisma.party.create({
            data: { name, phone, email, address, gstNumber, dlNumber },
        });
        res.status(201).json(party);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// PUT /api/parties/:id — Update supplier
router.put('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma_1.prisma.party.update({
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
