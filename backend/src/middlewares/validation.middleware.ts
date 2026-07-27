import { Request, Response, NextFunction } from 'express';

// Server-side validation middleware for Sales creation
export const validateCreateSale = (req: Request, res: Response, next: NextFunction) => {
  const { customerName, paymentMethod, items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Validation Error: Sale must contain at least one line item' });
  }

  // Validate items
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.productId || typeof item.productId !== 'string') {
      return res.status(400).json({ error: `Validation Error: Line item ${i + 1} is missing a valid productId` });
    }
    const qty = parseFloat(item.quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: `Validation Error: Line item ${i + 1} must have a positive quantity (> 0)` });
    }
    const price = parseFloat(item.unitPrice);
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ error: `Validation Error: Line item ${i + 1} unitPrice cannot be negative` });
    }
  }

  // Sanitize customer name
  if (customerName && typeof customerName === 'string') {
    const trimmed = customerName.trim();
    if (trimmed === '?' || trimmed.length < 2) {
      req.body.customerName = 'Walk-in Retail Customer';
    }
  }

  const validMethods = ['CASH', 'UPI', 'CARD', 'CREDIT', 'SPLIT'];
  if (paymentMethod && !validMethods.includes(paymentMethod)) {
    return res.status(400).json({ error: `Validation Error: Invalid paymentMethod '${paymentMethod}'` });
  }

  next();
};

// Server-side validation middleware for Purchase creation
export const validateCreatePurchase = (req: Request, res: Response, next: NextFunction) => {
  const { invoiceNumber, partyId, items } = req.body;

  if (!partyId || typeof partyId !== 'string') {
    return res.status(400).json({ error: 'Validation Error: Supplier / Party ID is required' });
  }

  if (!invoiceNumber || typeof invoiceNumber !== 'string' || !invoiceNumber.trim()) {
    return res.status(400).json({ error: 'Validation Error: Invoice number is required' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Validation Error: Purchase bill must contain at least one item' });
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.productId || typeof item.productId !== 'string') {
      return res.status(400).json({ error: `Validation Error: Purchase item ${i + 1} is missing a valid productId` });
    }
    if (!item.batchNumber || typeof item.batchNumber !== 'string' || !item.batchNumber.trim()) {
      return res.status(400).json({ error: `Validation Error: Purchase item ${i + 1} is missing a valid batch number` });
    }
    const qty = parseFloat(item.quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: `Validation Error: Purchase item ${i + 1} must have a positive quantity (> 0)` });
    }
    const rate = parseFloat(item.purchaseRate);
    if (isNaN(rate) || rate < 0) {
      return res.status(400).json({ error: `Validation Error: Purchase item ${i + 1} purchaseRate cannot be negative` });
    }
  }

  next();
};
