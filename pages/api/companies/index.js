import { connectDB } from '../../../lib/mongodb';
import { requireAuth } from '../../../lib/session';
import Company from '../../../models/Company';

export default async function handler(req, res) {
  const me = await requireAuth(req, res);
  if (!me) return;
  await connectDB();

  if (req.method === 'GET') {
    const cos = await Company.find().lean();
    return res.json(cos.map(c => ({ ...c, id: c._id.toString() })));
  }
  if (req.method === 'POST') {
    if (me.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const co = await Company.create({ name, color: color || '#7F77DD' });
    return res.status(201).json({ ...co.toObject(), id: co._id.toString() });
  }
  res.status(405).end();
}
