import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    ledgerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ledger",
      required: [true, "Ledger is required"],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },
    type: {
      type: String,
      enum: ["payment", "adjustment", "refund"],
      default: "payment",
    },
    method: {
      type: String,
      enum: ["cash", "bank", "other"],
      default: "cash",
    },
    note: {
      type: String,
      trim: true,
    },
    receiptUrl: {
      type: String,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recorded by user is required"],
      index: true,
    },
    recordedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    previousOutstanding: {
      type: Number,
      required: true,
    },
    newOutstanding: {
      type: Number,
      required: true,
    },
    idempotencyKey: {
      type: String,
      index: true,
    },
    offline: {
      type: Boolean,
      default: false,
    },
    syncStatus: {
      type: String,
      enum: ["pending", "synced", "failed"],
      default: "synced",
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ ledgerId: 1, recordedAt: -1 });
paymentSchema.index({ recordedBy: 1, recordedAt: -1 });

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
