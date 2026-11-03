export type Language = 'en' | 'ar';
export type SubmissionStatus = 'pending' | 'approved' | 'review' | 'rejected' | 'removed';
export interface Character { id:string; nameEn:string; nameAr:string; image:string; theme:string; color:string }
export const characters: Character[] = [
  {id:'mansour',nameEn:'Mansour',nameAr:'منصور',image:'/characters/mansour.png',theme:'discovery',color:'#e5483e'},
  {id:'obaid',nameEn:'Obaid',nameAr:'عبيد',image:'/characters/obaid.png',theme:'loyalty',color:'#29a9bf'},
  {id:'salem',nameEn:'Salem',nameAr:'سالم',image:'/characters/salem.png',theme:'wisdom',color:'#f3a83b'},
  {id:'turki',nameEn:'Turki',nameAr:'تركي',image:'/characters/turki.png',theme:'courage',color:'#4a79bb'},
  {id:'shamma',nameEn:'Shamma',nameAr:'شما',image:'/characters/shamma.png',theme:'creativity',color:'#db667f'},
  {id:'nano',nameEn:'Nano',nameAr:'نانو',image:'/characters/nano.png',theme:'wonder',color:'#5bbd8b'},
  {id:'grandpa-saqar',nameEn:'Grandpa Saqar',nameAr:'الجد صقر',image:'/characters/grandpa-saqar.png',theme:'heritage',color:'#886c50'},
  {id:'sara',nameEn:'Sara',nameAr:'سارة',image:'/characters/sara.png',theme:'kindness',color:'#7b65ba'}
];
export interface Prompt { id:string; en:string; ar:string; enabled:boolean }
export const prompts: Prompt[] = [
  {id:'family-meaning',en:'What does family mean to you?',ar:'ماذا تعني لك العائلة؟',enabled:true},
  {id:'happy-memory',en:'A memory with your family that always makes you smile…',ar:'ذكرى مع عائلتك تجعلك تبتسم دائماً…',enabled:true},
  {id:'feel-at-home',en:'Who makes you feel at home?',ar:'من يجعلك تشعر وكأنك في بيتك؟',enabled:true},
  {id:'family-lesson',en:'What is one thing you learned from your family?',ar:'ما أهم شيء تعلمته من عائلتك؟',enabled:true},
  {id:'describe-family',en:'Describe your family in your own words.',ar:'صِف عائلتك بكلماتك الخاصة.',enabled:true}
];
export interface Submission { _id:string; stickyNumber:number; rawMessage:string; generatedMessage:string; finalMessage:string; language:Language; character:string; promptId:string; status:SubmissionStatus; moderationReason?:string; createdAt:string; approvedAt?:string; displayedAt?:string; aiGenerationCount:number; userEdited:boolean; displayPriority:number; isFeatured:boolean; isDemo?:boolean }
export interface DisplaySettings { pausedIncoming:boolean; pausedAnimation:boolean; heroDuration:number; featuredDuration:number; maxActiveNotes:number; animationSpeed:number }
export const defaultDisplaySettings: DisplaySettings = {pausedIncoming:false,pausedAnimation:false,heroDuration:8000,featuredDuration:18000,maxActiveNotes:300,animationSpeed:0.3};
