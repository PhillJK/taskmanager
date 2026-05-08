import { getIronSession } from 'iron-session';
import { sessionOptions } from '../../../lib/session';
import { connectDB } from '../../../lib/mongodb';
import User from '../../../models/User';

export default async function handler(req, res) {
  const session = await getIronSession(req, res, sessionOptions);
  if (!session.user) return res.status(401).json(null);
  await connectDB();
  const user = await User.findById(session.user.id).select('-password').lean();
  if (!user) { session.destroy(); return res.status(401).json(null); }
  res.json({ ...user, id: user._id.toString() });
}
