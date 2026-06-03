# SewornaAI Security Specification

This document details the data security invariants, potential attack payloads ("Dirty Dozen"), and the unit test specifications to enforce zero-trust Attribute-Based Access Control (ABAC) on Firestore.

## 1. Data Invariants

1. **User Ownership**: A scholar can only access (read, write, delete) their own user document located at `/users/{userId}`.
2. **Draft Context**: A draft paper located at `/users/{userId}/drafts/{draftId}` must have standard metadata fields and must belong strictly to the authenticated `userId`.
3. **Immutability of Identity**: Once a draft is created, the owner field `userId` can never be reassigned to another user.
4. **Verified Authorship**: Only users with verified emails may create or modify academic papers in production.
5. **No System Overrides**: Standard users cannot modify other users' profiles or inject malicious character strings in document IDs.
6. **Limit Protection**: String contents in drafts and bibliography arrays must be size-constrained to prevent "Denial of Wallet" size exploits.

---

## 2. The "Dirty Dozen" Payloads

Here are 12 specific payloads attempting to violate security invariants, all of which must return `PERMISSION_DENIED`.

### Attack Tier 1: Identity Impersonation & Spoofing
1. **Payload #1 (Self-Assigned Profile ID mismatch)**:
   - *Target Path*: `/users/attacker_uid`
   - *Action*: `create`
   - *Context*: Authenticated as `victim_uid` matching `displayName: "Evil Guy"`. 
   - *Vulnerability targeted*: Impersonating a user by writing into another user's path.

2. **Payload #2 (Identity Spoofing in Draft Creation)**:
   - *Target Path*: `/users/victim_uid/drafts/draft_101`
   - *Action*: `create`
   - *Context*: Authenticated as `attacker_uid`. Payload specifies `userId: "victim_uid"`.
   - *Vulnerability targeted*: Creating a resource in someone else's space.

3. **Payload #3 (Unverified Email Write)**:
   - *Target Path*: `/users/unverified_uid/drafts/draft_01`
   - *Action*: `create`
   - *Context*: Authenticated as `unverified_uid` but `email_verified: false`.
   - *Vulnerability targeted*: Standard writes from unverified email logins.

### Attack Tier 2: State Validation & Modification
4. **Payload #4 (Immutable Owner Reassignment)**:
   - *Target Path*: `/users/scholar_uid/drafts/draft_01`
   - *Action*: `update`
   - *Context*: Authenticated as `scholar_uid`. Payload attempts to modify `userId` from `"scholar_uid"` to `"other_uid"`.
   - *Vulnerability targeted*: Transferring ownership of documents.

5. **Payload #5 (Anomalous Creation Timestamp)**:
   - *Target Path*: `/users/scholar_uid/drafts/draft_01`
   - *Action*: `create`
   - *Context*: Authenticated as `scholar_uid`. Payload specifies `createdAt` as a pre-dated 2012 timestamp instead of `request.time`.
   - *Vulnerability targeted*: Injecting past/future timestamps.

6. **Payload #6 (Ghost/Shadow Field Injection)**:
   - *Target Path*: `/users/scholar_uid/drafts/draft_01`
   - *Action*: `update`
   - *Context*: Authenticated as `scholar_uid`. Payload injects `isAdmin: true` along with permitted fields.
   - *Vulnerability targeted*: Shadow field privilege escalation.

### Attack Tier 3: Resource Poisoning & Size Exploits
7. **Payload #7 (Document ID Poisoning)**:
   - *Target Path*: `/users/scholar_uid/drafts/MaliciousId%20_with_spaces_and_giant_strings_more_than_128_characters_$$$`
   - *Action*: `create`
   - *Context*: Authenticated as `scholar_uid`.
   - *Vulnerability targeted*: Path payload/character poisoning.

8. **Payload #8 (Agressive Size Inflation)**:
   - *Target Path*: `/users/scholar_uid/drafts/draft_01`
   - *Action*: `create`
   - *Context*: Authenticated as `scholar_uid`. Payload has a 5MB title string.
   - *Vulnerability targeted*: Excessive resource usage / memory denial of service.

9. **Payload #9 (Overlarge Bibliography Array)**:
   - *Target Path*: `/users/scholar_uid/drafts/draft_01`
   - *Action*: `update`
   - *Context*: Authenticated as `scholar_uid`. Payload has a `bibliography` list with 50,000 items.
   - *Vulnerability targeted*: Exhausting Firestore document size constraints.

### Attack Tier 4: Unauthorized Relational Read & Scrapes
10. **Payload #10 (Blanket Read Profile Attempt)**:
    - *Target Path*: `/users/victim_uid`
    - *Action*: `get`
    - *Context*: Authenticated as `attacker_uid`.
    - *Vulnerability targeted*: Snooping on user emails and settings.

11. **Payload #11 (List Query Scrape)**:
    - *Target Collection*: `/users/victim_uid/drafts`
    - *Action*: `list`
    - *Context*: Authenticated as `attacker_uid`.
    - *Vulnerability targeted*: Bulk downloading intellectual property of another researcher.

12. **Payload #12 (Delete Unauthorized Draft)**:
    - *Target Path*: `/users/victim_uid/drafts/draft_01`
    - *Action*: `delete`
    - *Context*: Authenticated as `attacker_uid`.
    - *Vulnerability targeted*: Malicious deletion/vandalism of other user research papers.

---

## 3. Test Runner Design (`firestore.rules.test.ts`)

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';

describe('SewornaAI Firestore Security Rules', () => {
  let testEnv: any;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'gen-lang-client-0526773781',
      firestore: {
        host: 'localhost',
        port: 8080,
      }
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('blocks anonymous access completely to all collections', async () => {
    const context = testEnv.unauthenticatedContext();
    const db = context.firestore();
    await assertFails(getDoc(doc(db, 'users/some_user')));
    await assertFails(getDoc(doc(db, 'users/some_user/drafts/draft_01')));
  });

  it('enforces email verification for writes', async () => {
    const unverifiedContext = testEnv.authenticatedContext('attacker', {
      email: 'attacker@gmail.com',
      email_verified: false
    });
    const db = unverifiedContext.firestore();
    await assertFails(setDoc(doc(db, 'users/attacker'), {
      uid: 'attacker',
      email: 'attacker@gmail.com',
      createdAt: new Date()
    }));
  });

  it('prevents a user from reading or writing into another user’s profile', async () => {
    const context = testEnv.authenticatedContext('victim', {
      email: 'victim@gmail.com',
      email_verified: true
    });
    const db = context.firestore();
    
    // Attacker context
    const attackerContext = testEnv.authenticatedContext('attacker', {
      email: 'attacker@gmail.com',
      email_verified: true
    });
    const attackerDb = attackerContext.firestore();

    // Create victim profile
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await setDoc(doc(context.firestore(), 'users/victim'), {
        uid: 'victim',
        email: 'victim@gmail.com',
        createdAt: new Date()
      });
    });

    // Attempt unauthorized read
    await assertFails(getDoc(doc(attackerDb, 'users/victim')));
    // Attempt unauthorized write
    await assertFails(setDoc(doc(attackerDb, 'users/victim'), { displayName: 'Vandalized' }));
  });
});
```
