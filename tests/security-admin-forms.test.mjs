import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

function formsPageFixture({ signedIn = true, admin = null } = {}) {
  const calls = [];
  const forms = [{ id: 'fixture-form', invitee_name: 'Fixture', invitee_email: 'fixture@example.test' }];
  const denied = new Error('redirect to login');
  const modules = testModules({
    'next/navigation': { redirect(path) {
      assert.equal(path, '/admin/login');
      calls.push('redirect');
      throw denied;
    } },
    '@/lib/supabase/server': { createClient: async () => ({
      auth: { getClaims: async () => {
        calls.push('claims');
        return { data: { claims: signedIn ? { sub: 'fixture-user' } : null }, error: null };
      } },
      from(table) {
        assert.equal(table, 'admin_users');
        const query = {
          select() { return query; },
          eq(column, value) {
            assert.equal(column, 'user_id');
            assert.equal(value, 'fixture-user');
            return query;
          },
          async maybeSingle() {
            calls.push('admin-check');
            return { data: admin, error: null };
          },
        };
        return query;
      },
    }) },
    '@/lib/supabase/admin': { getSupabaseAdmin() {
      calls.push('privileged-client');
      return { from(table) {
        assert.equal(table, 'booking_intake_forms');
        return { select() {
          return { async order() {
            calls.push('private-intake-read');
            return { data: forms, error: null };
          } };
        } };
      } };
    } },
    '@/components/admin/AdminFormsClient': { default: () => null },
  });
  return {
    calls, forms, denied,
    page: modules.load('src/app/admin/(protected)/formularios/page.tsx').default,
  };
}

for (const [name, access] of [
  ['signed-out visitor', { signedIn: false }],
  ['authenticated non-admin', {}],
  ['inactive admin', { admin: { active: false } }],
]) {
  test(`admin forms page rejects ${name} before any privileged intake access`, async () => {
    const fixture = formsPageFixture(access);
    await assert.rejects(fixture.page(), error => error === fixture.denied);
    assert.equal(fixture.calls.includes('privileged-client'), false);
    assert.equal(fixture.calls.includes('private-intake-read'), false);
  });
}

test('admin forms page revalidates the active admin before reading private intake rows', async () => {
  const fixture = formsPageFixture({ admin: { active: true } });
  const result = await fixture.page();
  assert.deepEqual(fixture.calls, ['claims', 'admin-check', 'privileged-client', 'private-intake-read']);
  assert.deepEqual(result.props.initialForms, fixture.forms);
});
