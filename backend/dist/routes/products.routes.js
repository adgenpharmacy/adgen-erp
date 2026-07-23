"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// GET /api/products — Fetch active products with server-side query search (q) & pagination limits
router.get('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const { q, limit } = req.query;
        const searchStr = typeof q === 'string' ? q.trim() : '';
        const whereClause = { isActive: true };
        if (searchStr) {
            whereClause.OR = [
                { name: { contains: searchStr, mode: 'insensitive' } },
                { genericName: { contains: searchStr, mode: 'insensitive' } },
                { companyName: { contains: searchStr, mode: 'insensitive' } },
            ];
        }
        const products = await prisma_1.prisma.product.findMany({
            where: whereClause,
            take: limit ? parseInt(limit) : 5000,
            orderBy: { name: 'asc' },
            include: {
                batches: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
        });
        res.json(products);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// POST /api/products — Create a new product
router.post('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const { name, genericName, companyName, hsnCode, gstPercent, productType, division, packSize, packUnit, contentUnit, requiresColdStorage, lowStockThreshold, } = req.body;
        const product = await prisma_1.prisma.product.create({
            data: {
                name,
                genericName,
                companyName,
                hsnCode,
                gstPercent: parseFloat(gstPercent ?? 12),
                productType,
                division,
                packSize: parseInt(packSize ?? 1),
                packUnit: packUnit || 'Strip',
                contentUnit: contentUnit || 'Tablet',
                requiresColdStorage: Boolean(requiresColdStorage),
                lowStockThreshold: parseFloat(lowStockThreshold ?? 1),
            },
        });
        res.status(201).json(product);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// PUT /api/products/:id — Update a product
router.put('/:id', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const updated = await prisma_1.prisma.product.update({
            where: { id },
            data,
        });
        res.json(updated);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// DELETE /api/products/:id — Soft-delete product
router.delete('/:id', auth_middleware_1.authenticate, auth_middleware_1.requireOwner, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma_1.prisma.product.update({
            where: { id },
            data: { isActive: false },
        });
        res.json({ message: 'Product deactivated successfully' });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
exports.default = router;
