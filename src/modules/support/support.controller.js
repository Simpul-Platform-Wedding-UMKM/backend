import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

// POST /support/tickets — { subject, message }
const createTicketSchema = z.object({
  subject: z.string().min(1).max(150),
  message: z.string().min(1).max(2000),
});
export const createTicket = asyncHandler(async (req, res) => {
  const data = createTicketSchema.parse(req.body);
  const ticket = await prisma.supportTicket.create({
    data: {
      accountId: req.account.id,
      subject: data.subject,
      message: data.message,
    },
  });
  res.status(201).json(ticket);
});

// GET /support/tickets
export const listTickets = asyncHandler(async (req, res) => {
  const tickets = await prisma.supportTicket.findMany({
    where: { accountId: req.account.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(tickets);
});
