import mongoose from "mongoose";

const tenantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  plan: {
    type: String,
    default: "free",
    enum: ["free", "pro", "enterprise"],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Tenant = mongoose.model("Tenant", tenantSchema);
export default Tenant;
