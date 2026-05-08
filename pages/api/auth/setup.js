import { connectDB } from '../../../lib/mongodb';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '../../../lib/session';
import User from '../../../models/User';
import { hash } from '@node-rs/argon2';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  await connectDB();

  const existing = await User.exists({ role: 'admin' });
  if (existing) return res.status(400).json({ error: 'Admin already exists' });

  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'Name and password required' });

  const hashed = await hash(password);
  const user = await User.create({ name: name.trim(), password: hashed, role: 'admin' });

  const session = await getIronSession(req, res, sessionOptions);
  session.user = { id: user._id.toString(), name: user.name, role: user.role };
  await session.save();
  res.json({ ok: true });
}
