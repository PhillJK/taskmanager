import { connectDB } from '../../../lib/mongodb';
import { requireAuth } from '../../../lib/session';
import Company from '../../../models/Company';
import Task from '../../../models/Task';

export default async function handler(req, res) {
  const me = await requireAuth(req, res, ['admin']);
  if (!me) return;
  await connectDB();
  const { id } = req.query;

  if (req.method === 'PUT') {
    const co = await Company.findByIdAndUpdate(id, req.body, { new: true }).lean();
    return res.json({ ...co, id: co._id.toString() });
  }
  if (req.method === 'DELETE') {
    await Company.findByIdAndDelete(id);
    await Task.updateMany({ companyId: id }, { $set: { companyId: null } });
    return res.json({ ok: true });
  }
  res.status(405).end();
}
