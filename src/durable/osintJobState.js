/**
 * Durable Object: OSINT Job State Tracker
 * Tracks the state of OSINT pipeline jobs
 */

export class OsintJobState {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    
    if (request.method === 'GET') {
      // Get current state
      const state = await this.state.storage.get('state') || {
        status: 'queued',
        stage: 0,
        progress: 0,
        startedAt: null,
        updatedAt: null,
        error: null,
        reportId: null,
      };
      
      return new Response(JSON.stringify({ ok: true, data: state }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (request.method === 'POST') {
      // Update state
      let body;
      try {
        body = await request.json();
      } catch (_e) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid or missing request body' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const currentState = await this.state.storage.get('state') || {};
      
      const newState = {
        ...currentState,
        ...body,
        updatedAt: new Date().toISOString(),
      };
      
      if (!currentState.startedAt && body.status === 'running') {
        newState.startedAt = new Date().toISOString();
      }
      
      if (body.status === 'complete' || body.status === 'failed') {
        newState.completedAt = new Date().toISOString();
      }
      
      await this.state.storage.put('state', newState);
      
      return new Response(JSON.stringify({ ok: true, data: newState }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response('Method not allowed', { status: 405 });
  }

  /**
   * Update job state (called from pipeline)
   */
  async updateState(updates) {
    const currentState = await this.state.storage.get('state') || {};
    const newState = {
      ...currentState,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    if (!currentState.startedAt && updates.status === 'running') {
      newState.startedAt = new Date().toISOString();
    }
    
    if (updates.status === 'complete' || updates.status === 'failed') {
      newState.completedAt = new Date().toISOString();
    }
    
    await this.state.storage.put('state', newState);
    return newState;
  }

  /**
   * Get current state
   */
  async getState() {
    return await this.state.storage.get('state') || {
      status: 'queued',
      stage: 0,
      progress: 0,
      startedAt: null,
      updatedAt: null,
      error: null,
      reportId: null,
    };
  }
}

