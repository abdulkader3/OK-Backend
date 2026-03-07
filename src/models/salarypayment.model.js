import mongoose from "mongoose";

const salaryPaymentSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Staff member is required"],
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner is required"],
      index: true,
    },
    month: {
      type: Number,
      required: [true, "Month is required"],
      min: [1, "Month must be between 1 and 12"],
      max: [12, "Month must be between 1 and 12"],
    },
    year: {
      type: Number,
      required: [true, "Year is required"],
      min: [2000, "Year must be 2000 or later"],
      max: [2100, "Year must be 2100 or earlier"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "bank", "other"],
      default: "bank",
    },
    attachment: {
      url: { type: String },
      publicId: { type: String },
      uploadedAt: { type: Date },
    },
    note: {
      type: String,
      maxlength: [500, "Note cannot exceed 500 characters"],
      trim: true,
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
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

salaryPaymentSchema.index({ staffId: 1, year: 1, month: 1 });
salaryPaymentSchema.index({ ownerId: 1, createdAt: -1 });
salaryPaymentSchema.index({ staffId: 1, createdAt: -1 });

salaryPaymentSchema.pre("save", function (next) {
  if (!this.paidAt) {
    this.paidAt = new Date();
  }
  next();
});

const SalaryPayment = mongoose.model("SalaryPayment", salaryPaymentSchema);

export default SalaryPayment;
