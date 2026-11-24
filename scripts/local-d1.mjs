import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';

export function localDatabase(filename=':memory:'){
  const sqlite=new DatabaseSync(filename);
  const directory=new URL('../drizzle/',import.meta.url);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  if(filename!==':memory:')sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  sqlite.exec('CREATE TABLE IF NOT EXISTS local_schema_migrations (name TEXT PRIMARY KEY)');
  const applied=sqlite.prepare('SELECT 1 FROM local_schema_migrations WHERE name=?');
  const mark=sqlite.prepare('INSERT INTO local_schema_migrations VALUES (?)');
  for(const file of readdirSync(directory).filter(file=>file.endsWith('.sql')).sort()){
    sqlite.exec('BEGIN IMMEDIATE');
    try{
      if(!applied.get(file)){
        sqlite.exec(readFileSync(new URL(file,directory),'utf8'));
        mark.run(file);
      }
      sqlite.exec('COMMIT');
    }catch(error){sqlite.exec('ROLLBACK');sqlite.close();throw error;}
  }
  function prepare(statement){
    const bind=(...args)=>({
      first:()=>sqlite.prepare(statement).get(...args),
      all:()=>({results:sqlite.prepare(statement).all(...args)}),
      run:()=>({meta:{changes:sqlite.prepare(statement).run(...args).changes}})
    });
    return {...bind(),bind};
  }
  return {sqlite,DB:{prepare,batch(commands){
    sqlite.exec('BEGIN IMMEDIATE');
    try{
      const results=commands.map(command=>command.run());
      sqlite.exec('COMMIT');
      return results;
    }catch(error){sqlite.exec('ROLLBACK');throw error;}
  }}};
}
