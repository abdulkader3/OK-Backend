import mongoose from "mongoose";

const bigBossBillSchema = new mongoose.Schema(
  {
    bigBossId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BigBoss",
      required: [true, "Big Boss is required"],
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
    description: {
      type: String,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
      trim: true,
    },
    attachment: {
      url: { type: String },
      publicId: { type: String },
      uploadedAt: { type: Date },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

bigBossBillSchema.index({ ownerId: 1, deletedAt: 1 });
bigBossBillSchema.index({ bigBossId: 1, month: 1, year: 1, deletedAt: 1 });
bigBossBillSchema.index({ ownerId: 1, year: 1, deletedAt: 1 });

bigBossBillSchema.pre("find", function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

bigBossBillSchema.pre("findOne", function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

bigBossBillSchema.pre("save", function (next) {
  if (this.month && this.year) {
    this._monthYear = `${this.year}-${String(this.month).padStart(2, "0")}`;
  }
  next();
});

const BigBossBill = mongoose.model("BigBossBill", bigBossBillSchema);

export default BigBossBill;
