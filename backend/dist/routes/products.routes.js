"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Helper function to calculate medical search relevance score
function calculateSearchRelevance(product, query) {
    if (!query)
        return 0;
    const q = query.toLowerCase().trim();
    const name = (product.name || '').toLowerCase();
    const generic = (product.genericName || '').toLowerCase();
    const company = (product.companyName || '').toLowerCase();
    // 1. Name starts directly with search query (Highest priority) -> 100 points
    if (name.startsWith(q))
        return 100;
    // 2. A word inside product name starts with query -> 80 points
    const words = name.split(/\s+/);
    if (words.some((w) => w.startsWith(q)))
        return 80;
    // 3. Generic name or company starts with query -> 60 points
    if (generic.startsWith(q) || company.startsWith(q))
        return 60;
    // 4. Name contains query as a substring -> 40 points
    if (name.includes(q))
        return 40;
    // 5. Generic or company contains query as a substring -> 20 points
    if (generic.includes(q) || company.includes(q))
        return 20;
    return 0;
}
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
        let products = await prisma_1.prisma.product.findMany({
            where: whereClause,
            take: limit ? parseInt(limit) : 5000,
            include: {
                batches: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
        });
        // If query string exists, sort by smart medical relevance score (descending) then by name (ascending)
        if (searchStr) {
            products = products.sort((a, b) => {
                const scoreA = calculateSearchRelevance(a, searchStr);
                const scoreB = calculateSearchRelevance(b, searchStr);
                if (scoreB !== scoreA) {
                    return scoreB - scoreA; // Highest relevance score first
                }
                return a.name.localeCompare(b.name);
            });
        }
        else {
            products = products.sort((a, b) => a.name.localeCompare(b.name));
        }
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
