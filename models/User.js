import mongoose from 'mongoose';
const S = mongoose.Schema;

const schema = new S({
  name:         { type: String, required: true, unique: true, trim: true },
  password:     { type: String, required: true },
  role:         { type: String, enum: ['admin','manager','user'], default: 'user' },
  managerId:    { type: S.Types.ObjectId, ref: 'User', default: null },   // user/manager → their direct manager
  supervisorId: { type: S.Types.ObjectId, ref: 'User', default: null },   // manager → supervising manager
}, { timestamps: true });

export default mongoose.models.User || mongoose.model('User', schema);
