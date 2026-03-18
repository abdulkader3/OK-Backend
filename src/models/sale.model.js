import mongoose from "mongoose";

const saleItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
  },
  clientProductId: {
    type: String,
  },
  name: {
    type: String,
    required: true,
    minlength: [1, "Product name is required"],
  },
  price: {
    type: Number,
    required: true,
    min: [0, "Price cannot be negative"],
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, "Quantity must be at least 1"],
  },
  subtotal: {
    type: Number,
    required: true,
    min: [0, "Subtotal cannot be negative"],
  },
});

const saleSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner is required"],
      index: true,
    },
    ledgerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ledger",
      default: null,
    },
    totalAmount: {
      type: Number,
      required: [true, "Total amount is required"],
      min: [0, "Total cannot be negative"],
    },
    items: [saleItemSchema],
    clientTempId: {
      type: String,
      index: true,
    },
    idempotencyKey: {
      type: String,
      index: true,
    },
    syncStatus: {
      type: String,
      enum: ["synced", "pending", "failed"],
      default: "pending",
    },
    ledgerDebtCreated: {
      type: Boolean,
      default: false,
    },
    ledgerDebtId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    recordedAtClient: {
      type: Date,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card"],
      default: null,
    },
    deleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

saleSchema.index({ ownerId: 1, deleted: 1 });
saleSchema.index({ ownerId: 1, syncStatus: 1 });
saleSchema.index({ ownerId: 1, createdAt: -1 });
saleSchema.index({ ledgerId: 1 });

const Sale = mongoose.model("Sale", saleSchema);

export default Sale;
