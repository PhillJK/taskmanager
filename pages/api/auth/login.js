import { connectDB } from '../../../lib/mongodb';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '../../../lib/session';
import User from '../../../models/User';
import { verify } from '@node-rs/argon2';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  await connectDB();

  const { name, password } = req.body;
  const user = await User.findOne({ name: name?.trim() }).lean();
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await verify(user.password, password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const session = await getIronSession(req, res, sessionOptions);
  session.user = { id: user._id.toString(), name: user.name, role: user.role };
  await session.save();
  res.json({ ok: true, user: { id: user._id, name: user.name, role: user.role } });
}
