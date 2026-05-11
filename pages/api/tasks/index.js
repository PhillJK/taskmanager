import { connectDB } from '../../../lib/mongodb';
import { requireAuth } from '../../../lib/session';
import User from '../../../models/User';
import Task from '../../../models/Task';

async function visibleQuery(me, allUsers) {
  if (me.role === 'admin') return {};
  const ids = new Set([me.id]);
  if (me.role === 'manager') {
    // direct reports — admins are a separate level and are never visible to managers
    allUsers
      .filter(u => u.managerId?.toString() === me.id && u.role !== 'admin')
      .forEach(u => ids.add(u._id.toString()));
    // supervised managers + their reports — exclude admins
    const supMgrs = allUsers.filter(u => u.supervisorId?.toString() === me.id && u.role === 'manager');
    supMgrs.forEach(m => {
      ids.add(m._id.toString());
      allUsers
        .filter(u => u.managerId?.toString() === m._id.toString() && u.role !== 'admin')
        .forEach(u => ids.add(u._id.toString()));
    });
  }
  // Also surface tasks the user has been asked to approve
  return { $or: [{ assignedTo: { $in: [...ids] } }, { approvalRequestedTo: me.id }] };
}

export default async function handler(req, res) {
  const me = await requireAuth(req, res);
  if (!me) return;
  await connectDB();

  if (req.method === 'GET') {
    const allUsers = await User.find().lean();
    const q = await visibleQuery(me, allUsers);
    const tasks = await Task.find(q).lean();
    return res.json(tasks.map(t => ({ ...t, id: t._id.toString() })));
  }

  if (req.method === 'POST') {
    const { title, description, notes, companyId, assignedTo, priority,
            status, deadline, subtasks, links, attachments } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const task = await Task.create({
      title, description, notes,
      companyId: companyId || null,
      assignedTo: assignedTo || null,
      createdBy: me.id,
      priority: priority || '',
      status: status || 'assigned',
      deadline: deadline || '',
      subtasks: subtasks || [],
      links: links || [],
      attachments: attachments || [],
    });
    return res.status(201).json({ ...task.toObject(), id: task._id.toString() });
  }

  res.status(405).end();
}
