"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireOwner = exports.authenticate = void 0;
const prisma_1 = require("../config/prisma");
const authenticate = async (req, res, next) => {
    try {
        // 1. Fetch default Owner User from PostgreSQL DB
        let user = await prisma_1.prisma.user.findFirst({ where: { role: 'OWNER' } });
        if (!user) {
            user = await prisma_1.prisma.user.create({
                data: {
                    name: 'Pharmacy Owner',
                    email: 'owner@adgen.com',
                    passwordHash: '$2a$10$abcdef1234567890dummyhash',
                    role: 'OWNER',
                },
            });
        }
        req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        };
        next();
    }
    catch (error) {
        console.error('Authentication Error:', error);
        return res.status(500).json({ error: 'Authentication internal error' });
    }
};
exports.authenticate = authenticate;
const requireOwner = (req, res, next) => {
    if (req.user?.role !== 'OWNER') {
        return res.status(403).json({ error: 'Forbidden: Owner role required' });
    }
    next();
};
exports.requireOwner = requireOwner;
