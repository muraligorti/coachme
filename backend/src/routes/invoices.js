import { Router } from "express";
import { authenticate, authorize, sanitizeBody, audit } from "../middleware/auth.js";
import * as invoiceController from "../controllers/invoiceController.js";

const router = Router();

router.get("/razorpay/status", authenticate, authorize("COACH"), invoiceController.getRazorpayStatus);
router.put("/razorpay/keys", authenticate, authorize("COACH"), sanitizeBody, audit("save_razorpay_keys", "coach_profile"), invoiceController.saveRazorpayKeys);
router.delete("/razorpay/keys", authenticate, authorize("COACH"), audit("disconnect_razorpay", "coach_profile"), invoiceController.disconnectRazorpay);

router.post("/", authenticate, authorize("COACH"), sanitizeBody, audit("create_invoice", "invoice"), invoiceController.create);
router.get("/", authenticate, authorize("COACH"), invoiceController.list);
router.post("/:id/payment-link", authenticate, authorize("COACH"), audit("generate_payment_link", "invoice"), invoiceController.generatePaymentLink);
router.post("/:id/refresh-status", authenticate, authorize("COACH"), invoiceController.refreshStatus);
router.patch("/:id/mark-paid", authenticate, authorize("COACH"), audit("mark_invoice_paid", "invoice"), invoiceController.markPaid);
router.patch("/:id/cancel", authenticate, authorize("COACH"), audit("cancel_invoice", "invoice"), invoiceController.cancel);

export default router;
