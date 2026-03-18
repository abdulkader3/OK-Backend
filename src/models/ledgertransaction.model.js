import mongoose from "mongoose";

const ledgerTransactionSchema = new mongoose.Schema(
  {
    ledgerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ledger",
      required: [true, "Ledger ID is required"],
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner is required"],
      index: true,
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    type: {
      type: String,
      enum: ["owes_me", "i_owe"],
      required: [true, "Transaction type is required"],
    },
    transactionDate: {
      type: Date,
      required: [true, "Transaction date is required"],
      index: true,
    },
    source: {
      type: String,
      enum: ["migration", "ledger_create", "payment", "adjustment"],
      default: "ledger_create",
    },
    description: {
      type: String,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
  },
  {
    timestamps: true,
  }
);

ledgerTransactionSchema.index({ ownerId: 1, transactionDate: 1 });
ledgerTransactionSchema.index({ ownerId: 1, type: 1, transactionDate: 1 });

ledgerTransactionSchema.virtual("amountValue").get(function () {
  return this.amount ? Number(this.amount.toString()) : 0;
});

const LedgerTransaction = mongoose.model(
  "LedgerTransaction",
  ledgerTransactionSchema
);

export default LedgerTransaction;
