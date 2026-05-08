import { connectDB } from '../../../lib/mongodb';
import { requireAuth } from '../../../lib/session';
import Task from '../../../models/Task';

export default async function handler(req, res) {
  const me = await requireAuth(req, res);
  if (!me) return;
  await connectDB();
  const { id } = req.query;

  if (req.method === 'PUT') {
    const body = { ...req.body };
    // Only admin/manager can rate
    if (body.rating !== undefined) {
      if (me.role === 'user') return res.status(403).json({ error: 'Users cannot rate tasks' });
      body.ratedBy = me.id;
    }
    const task = await Task.findByIdAndUpdate(id, body, { new: true }).lean();
    if (!task) return res.status(404).json({ error: 'Not found' });
    return res.json({ ...task, id: task._id.toString() });
  }

  if (req.method === 'DELETE') {
    await Task.findByIdAndDelete(id);
    return res.json({ ok: true });
  }

  res.status(405).end();
}
