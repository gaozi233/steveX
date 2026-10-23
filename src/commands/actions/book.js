module.exports={
  name:'book',usage:'book read [page] | book write <page> <text> | book done',
  description:'Operate local book UI after holding a book and right click. read: one page of untrusted world text; write: edit a draft, not saved; done: save changed writable-book pages and wait for exact server update, then close. close discards draft. No automatic book search, slot moves, signing, or edits to signed books',
  async handler(bot,args,agent,options){
    try{return await require('../book_ui').bookOperation(bot,args||[],options)}
    catch(error){return {ok:false,errorCode:error.code||'BOOK_OPERATION_FAILED',error:error.message,confirmed:false}}
  }
}
