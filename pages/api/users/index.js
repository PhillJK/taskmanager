import { connectDB } from '../../../lib/mongodb';
import { requireAuth } from '../../../lib/session';
import User from '../../../models/User';
import { hash } from '@node-rs/argon2';

export default async function handler(req, res) {
  const me = await requireAuth(req, res);
  if (!me) return;
  await connectDB();

  if (req.method === 'GET') {
    const users = await User.find().select('-password').lean();
    return res.json(users.map(u => ({ ...u, id: u._id.toString() })));
  }

  if (req.method === 'POST') {
    if (me.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { name, password, role, managerId, supervisorId } = req.body;
    if (!name || !password) return res.status(400).json({ error: 'Name and password required' });
    const exists = await User.findOne({ name: name.trim() });
    if (exists) return res.status(400).json({ error: 'Name already taken' });
    const hashed = await hash(password);
    const user = await User.create({
      name: name.trim(), password: hashed, role: role || 'user',
      managerId: managerId || null, supervisorId: supervisorId || null,
    });
    const u = user.toObject();
    delete u.password;
    return res.status(201).json({ ...u, id: u._id.toString() });
  }

  res.status(405).end();
}
