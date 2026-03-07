import mongoose from "mongoose";

const bigBossSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Big Boss name is required"],
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
      trim: true,
    },
    description: {
      type: String,
      maxlength: [500, "Description cannot exceed 500 characters"],
      trim: true,
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

bigBossSchema.index({ ownerId: 1, deletedAt: 1 });
bigBossSchema.index({ name: "text" });

bigBossSchema.pre("find", function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

bigBossSchema.pre("findOne", function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

const BigBoss = mongoose.model("BigBoss", bigBossSchema);

export default BigBoss;
