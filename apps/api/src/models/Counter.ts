import{Schema,model}from'mongoose';const schema=new Schema({_id:String,seq:{type:Number,default:1841}},{versionKey:false});export const Counter=model('Counter',schema);
