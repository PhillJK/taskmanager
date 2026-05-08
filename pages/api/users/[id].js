import { connectDB } from '../../../lib/mongodb';
import { requireAuth } from '../../../lib/session';
import User from '../../../models/User';
import Task from '../../../models/Task';
import { hash } from '@node-rs/argon2';

export default async function handler(req, res) {
  const me = await requireAuth(req, res);
  if (!me) return;
  await connectDB();
  const { id } = req.query;

  if (req.method === 'PUT') {
    if (me.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { name, password, role, managerId, supervisorId } = req.body;
    const update = { role, managerId: managerId || null, supervisorId: supervisorId || null };
    if (name) update.name = name.trim();
    if (password) update.password = await hash(password);
    const user = await User.findByIdAndUpdate(id, update, { new: true }).select('-password').lean();
    if (!user) return res.status(404).json({ error: 'Not found' });
    return res.json({ ...user, id: user._id.toString() });
  }

  if (req.method === 'DELETE') {
    if (me.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    if (me.id === id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await User.findByIdAndDelete(id);
    await User.updateMany({ managerId: id }, { $set: { managerId: null } });
    await User.updateMany({ supervisorId: id }, { $set: { supervisorId: null } });
    await Task.updateMany({ assignedTo: id }, { $set: { assignedTo: null } });
    return res.json({ ok: true });
  }

  res.status(405).end();
}
