function createDistributionStateStore({connectionString, pool:providedPool}={}) {
  let pool=providedPool,ready=false;
  const isConfigured=()=>Boolean(connectionString||pool);
  function getPool(){if(!isConfigured())throw Error('DISTRIBUTION_STATE_NOT_CONFIGURED');if(!pool){const {Pool}=require('pg');pool=new Pool({connectionString,max:2,connectionTimeoutMillis:5000,query_timeout:10000});}return pool;}
  async function init(){
    await getPool().query('CREATE TABLE IF NOT EXISTS distribution_connector_state (state_key TEXT PRIMARY KEY, state_value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');ready=true;
  }
  function db(){if(!ready)throw Error('DISTRIBUTION_STATE_NOT_READY');return getPool();}
  async function get(key){const result=await db().query('SELECT state_value FROM distribution_connector_state WHERE state_key=$1',[key]);return result.rows[0]?.state_value??null;}
  async function set(key,value,options={}){
    const sql=options.NX?'INSERT INTO distribution_connector_state(state_key,state_value) VALUES($1,$2) ON CONFLICT(state_key) DO NOTHING RETURNING state_key':
      'INSERT INTO distribution_connector_state(state_key,state_value) VALUES($1,$2) ON CONFLICT(state_key) DO UPDATE SET state_value=EXCLUDED.state_value,updated_at=NOW() RETURNING state_key';
    const result=await db().query(sql,[key,String(value)]);return result.rowCount?'OK':null;
  }
  async function del(key){const r=await db().query('DELETE FROM distribution_connector_state WHERE state_key=$1',[key]);return r.rowCount;}
  return {init,isConfigured,get,set,del};
}
module.exports={createDistributionStateStore};
