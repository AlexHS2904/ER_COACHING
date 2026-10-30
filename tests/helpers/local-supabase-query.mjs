// Test-only PostgREST query adapter. Executes SQL in the supplied isolated local
// cluster, never loads environment/credentials or connects to remote Supabase.
export function localSupabaseQuery(pg) {
  const stats={updates:[],rpcs:[],queries:[]};
  const literal=x=>x===null?'NULL':typeof x==='boolean'?(x?'true':'false'):
    typeof x==='number'?String(x):`'${(typeof x==='object'?JSON.stringify(x):String(x)).replaceAll("'","''")}'`;
  const name=x=>{if(!/^[a-z_][a-z_0-9]*$/.test(x))throw new Error('Invalid test identifier');return x;};
  const run=q=>JSON.parse(pg.sql(q)||'null');
  function split(input){let depth=0,start=0;const out=[];
    for(let i=0;i<input.length;i++){if(input[i]==='(')depth++;if(input[i]===')')depth--;if(input[i]===','&&depth===0){out.push(input.slice(start,i));start=i+1;}}
    return [...out,input.slice(start)];
  }
  function filter(input){
    if(input.startsWith('and(')||input.startsWith('or(')){
      const op=input.startsWith('and(')?'AND':'OR',start=input.indexOf('(')+1;
      return `(${split(input.slice(start,-1)).map(filter).join(` ${op} `)})`;
    }
    const [field,op,...rest]=input.split('.');
    const value=rest.join('.');
    if(op==='is'&&value==='null')return `${name(field)} IS NULL`;
    const operators={eq:'=',neq:'<>',lt:'<',lte:'<=',gt:'>',gte:'>='};
    if(!operators[op])throw new Error('Unsupported test filter');
    return `${name(field)} ${operators[op]} ${literal(value)}`;
  }
  return {stats,literal,from(table){
    name(table);const where=[],orders=[];let values=null,fields='*',limit=null;
    const q={
      select(columns='*'){fields=columns==='*'?'*':columns.split(',').map(name).join(',');return q;},
      update(data){values=data;return q;},
      eq(k,v){where.push(`${name(k)} = ${literal(v)}`);return q;},
      neq(k,v){where.push(`${name(k)} <> ${literal(v)}`);return q;},
      in(k,v){where.push(`${name(k)} IN (${v.map(literal).join(',')})`);return q;},
      is(k,v){if(v!==null)throw new Error('Only null supported');where.push(`${name(k)} IS NULL`);return q;},
      lte(k,v){where.push(`${name(k)} <= ${literal(v)}`);return q;},
      or(expression){where.push(`(${split(expression).map(filter).join(' OR ')})`);return q;},
      order(k,{ascending=true,nullsFirst=false}={}){orders.push(`${name(k)} ${ascending?'ASC':'DESC'} NULLS ${nullsFirst?'FIRST':'LAST'}`);return q;},
      limit(n){limit=n;return q;},
      async maybeSingle(){const r=execute();return {...r,data:r.data?.[0]??null};},
      then(resolve,reject){return Promise.resolve().then(execute).then(resolve,reject);},
    };
    function execute(){
      const predicate=where.length?' WHERE '+where.join(' AND '):'';
      const sql=values?`UPDATE public.${table} SET ${Object.entries(values).map(([k,v])=>`${name(k)}=${literal(v)}`).join(',')}${predicate} RETURNING ${fields}`:
        `SELECT ${fields} FROM public.${table}${predicate}${orders.length?' ORDER BY '+orders.join(','):''}${limit===null?'':' LIMIT '+limit}`;
      try {
        const data=run(`WITH result AS (${sql}) SELECT coalesce(jsonb_agg(to_jsonb(result)),'[]') FROM result;`);
        stats.queries.push({table,write:!!values,rows:data.length});
        if(values)stats.updates.push({table,values:structuredClone(values),rows:data.length});
        return {data,error:null};
      }catch(e){return {data:null,error:{message:e.message.match(/ERROR:\s+([^\n]+)/)?.[1]??'local query failed'}};}
    }
    return q;
  },async rpc(fn,args){
    const sql=`SELECT to_jsonb(public.${name(fn)}(${Object.entries(args).map(([k,v])=>`${name(k)} => ${literal(v)}`).join(',')}));`;
    try{const data=run(sql);stats.rpcs.push({fn,args:structuredClone(args)});return {data,error:null};}
    catch(e){return {data:null,error:{message:e.message.match(/ERROR:\s+([^\n]+)/)?.[1]??'local RPC failed'}};}
  }};
}
