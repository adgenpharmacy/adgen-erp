"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// GET /api/users — Fetch all users
router.get('/', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const users = await prisma_1.prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                isApproved: true,
                createdAt: true,
            },
        });
        res.json(users);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// POST /api/users/register — Register new staff member
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, designation } = req.body;
        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }
        const existing = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }
        const newUser = await prisma_1.prisma.user.create({
            data: {
                firebaseUid: `uid_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                name,
                email,
                role: 'EMPLOYEE',
                designation: designation || 'Pharmacist',
                isActive: true,
                isApproved: false, // Requires owner approval
            },
        });
        res.json({ message: 'Registration submitted! Awaiting owner approval.', user: newUser });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// POST /api/users/login — Verify employee login & approval status
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        // Verify Owner Credentials
        if (email.toLowerCase() === 'owner@adgenpharmacy.com') {
            if (password !== 'owner123' && password !== 'password123') {
                return res.status(401).json({ error: 'Invalid credentials. Password incorrect for Owner account.' });
            }
            let owner = await prisma_1.prisma.user.findUnique({ where: { email } });
            if (!owner) {
                owner = await prisma_1.prisma.user.create({
                    data: {
                        firebaseUid: 'owner_firebase_uid_001',
                        name: 'Pharmacy Owner',
                        email,
                        role: 'OWNER',
                        isActive: true,
                        isApproved: true,
                    },
                });
            }
            return res.json({
                user: {
                    id: owner.id,
                    name: owner.name,
                    email: owner.email,
                    role: 'OWNER',
                    isApproved: true,
                },
                token: 'owner_jwt_token_valid',
            });
        }
        const user = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(404).json({ error: 'User not found. Please register first.' });
        }
        if (user.role === 'EMPLOYEE' && !user.isApproved) {
            return res.status(403).json({ error: 'Account pending owner approval. Please contact pharmacy admin.' });
        }
        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isApproved: user.isApproved,
            },
            token: `token_${user.id}`,
        });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// PUT /api/users/:id/approve — Owner approves staff member
router.put('/:id/approve', auth_middleware_1.authenticate, auth_middleware_1.requireOwner, async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma_1.prisma.user.update({
            where: { id },
            data: { isApproved: true },
        });
        res.json(updated);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.default = router;
