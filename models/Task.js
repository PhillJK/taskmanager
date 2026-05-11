import mongoose from 'mongoose';
const S = mongoose.Schema;

const schema = new S({
  title:       { type: String, required: true },
  description: String,
  notes:       String,
  companyId:   { type: S.Types.ObjectId, ref: 'Company', default: null },
  assignedTo:  { type: S.Types.ObjectId, ref: 'User', default: null },
  createdBy:   { type: S.Types.ObjectId, ref: 'User', default: null },
  priority:    { type: String, enum: ['ui','uni','niu',''], default: '' },
  status:      { type: String, enum: ['assigned','scheduled','inprogress','done'], default: 'assigned' },
  deadline:    { type: String, default: '' },
  subtasks:    [{ _id:false, id:String, text:String, done:{type:Boolean,default:false} }],
  links:       [{ _id:false, id:String, url:String, label:String }],
  attachments: [{ _id:false, id:String, name:String, type:String, size:Number, data:String }],
  rating:      { type: Number, min:0, max:5, default:0 },
  ratedBy:     { type: S.Types.ObjectId, ref: 'User', default: null },
  approvalRequestedTo: { type: S.Types.ObjectId, ref: 'User', default: null },
  approvalStatus:      { type: String, enum: ['','assigned','in_review','approved','comments_issued'], default: '' },
  approvalComments:    { type: String, default: '' },
  completedAt:         { type: Date, default: null },
}, { timestamps: true });

export default mongoose.models.Task || mongoose.model('Task', schema);
