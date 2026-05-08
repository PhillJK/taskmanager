import { connectDB } from '../../../lib/mongodb';
import User from '../../../models/User';

export default async function handler(req, res) {
  await connectDB();
  const hasAdmin = await User.exists({ role: 'admin' });
  res.json({ hasAdmin: !!hasAdmin });
}
