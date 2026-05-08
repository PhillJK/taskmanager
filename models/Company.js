import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  name:  { type: String, required: true, trim: true },
  color: { type: String, default: '#7F77DD' },
}, { timestamps: true });
export default mongoose.models.Company || mongoose.model('Company', schema);
