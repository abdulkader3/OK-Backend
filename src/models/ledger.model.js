import mongoose from "mongoose";

const ledgerSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner is required"],
      index: true,
    },
    type: {
      type: String,
      enum: ["owes_me", "i_owe"],
      required: [true, "Ledger type is required"],
    },
    counterpartyName: {
      type: String,
      required: [true, "Counterparty name is required"],
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
      trim: true,
    },
    counterpartyContact: {
      type: String,
      trim: true,
    },
    initialAmount: {
      type: Number,
      required: [true, "Initial amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    outstandingBalance: {
      type: Number,
      required: true,
      min: [0, "Balance cannot be negative"],
    },
    currency: {
      type: String,
      default: "USD",
      uppercase: true,
    },
    dueDate: {
      type: Date,
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    notes: {
      type: String,
      maxlength: [2000, "Notes cannot exceed 2000 characters"],
    },
    attachments: [
      {
        url: String,
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
    },
  },
  {
    timestamps: true,
  }
);

ledgerSchema.index({ ownerId: 1, type: 1 });
ledgerSchema.index({ ownerId: 1, dueDate: 1 });
ledgerSchema.index({ ownerId: 1, priority: 1 });
ledgerSchema.index({ tags: 1 });
ledgerSchema.index({ counterpartyName: "text" });

ledgerSchema.pre("save", function (next) {
  if (this.isNew) {
    this.outstandingBalance = this.initialAmount;
  }
  next();
});

const Ledger = mongoose.model("Ledger", ledgerSchema);

export default Ledger;
