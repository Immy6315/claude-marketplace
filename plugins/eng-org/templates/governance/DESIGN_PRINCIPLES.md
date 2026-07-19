# Design Principles Curriculum

> **Posture: Boy-Scout, not Demolition.**
> These principles guide code you write or change today. They do NOT mandate rewrites of
> pre-existing code you are not already touching. Apply the principle to the scope of your
> current diff; leave the rest of the codebase better than you found it, not torn down.
>
> This is a curriculum, not a rulebook. Every principle includes a **when-NOT** field
> that names the concrete competing force under which applying the principle would be the
> wrong call. Learning those trade-offs is the point.

---

## 1. Single Responsibility Principle (SRP)

**def:** A module, class, or function should have exactly one reason to change — one
primary actor or concern that drives its evolution.

**why:** When two unrelated concerns live in one unit, a change to either concern risks
breaking the other. The coupling makes tests narrow and diffs wide.

**smell:** A function named `createUserAndSendWelcomeEmail` that both writes to the DB
and calls an SMTP client. A class with methods spanning data-validation, persistence,
and notification. A file that imports from the DB layer, the email provider, and the
analytics SDK.

**fix:** Split along the natural seam. The persistence concern goes to a repository; the
notification concern goes to a notification service. Wire them together at the service
layer, not inside the repository.

**when-NOT:** When the "responsibility" is deliberately colocated for atomicity — e.g., a
database transaction function that must create a record AND decrement a counter in one
ACID block. Splitting these into separate units breaks the transaction guarantee. Cohesion
of an atomic operation outweighs SRP's drive to split.

---

## 2. Open-Closed Principle (OCP)

**def:** A module should be open for extension (new behaviors can be added) but closed
for modification (existing, tested code is not changed to accommodate the extension).

**why:** Each modification to a stable module risks breaking its existing callers. OCP
channels new behaviors through extension points (polymorphism, plugin slots, strategy
injection) so stable paths are not perturbed.

**smell:** Every time you add a new payment provider you open `PaymentService` and add an
`if (provider === 'stripe') … else if (provider === 'paypal') …` branch. Callers of
`PaymentService` must now be retested for regressions.

**fix:** Define a `PaymentProvider` interface; each provider is a concrete implementation.
`PaymentService` accepts a `PaymentProvider` and delegates — new providers are added
without opening `PaymentService`.

**when-NOT:** When the extension surface is unknown or the abstractions are premature.
Designing an abstract plugin interface before you have two concrete implementations leads
to the wrong abstraction (often discovered only when the third implementation arrives).
YAGNI and OCP are in tension here: OCP pays for itself only when the extension axis is
well-understood. For a single-implementation system, the closed-for-modification seam is
overhead until the second implementation proves the axis.

---

## 3. Liskov Substitution Principle (LSP)

**def:** Objects of a subtype must be usable everywhere the supertype is expected, without
callers needing to know which concrete type they hold.

**why:** Violated LSP forces callers to type-check or down-cast, leaking implementation
details up the call chain. It also makes polymorphism fragile: swapping implementations
breaks callers.

**smell:** A `ReadOnlyFile` extends `File` but throws `NotImplementedError` on `write()`.
Callers that call `file.write()` must guard with `if (file instanceof ReadOnlyFile)` —
the subtype is not substitutable.

**fix:** Model "read-only" as a separate interface without `write()`. If the two concepts
genuinely share only `read()`, extract a `Readable` interface and have both implement it.
Do not use inheritance to share code when the behavioral contract differs.

**when-NOT:** When the type system offers no native covariant interface mechanism and the
cost of a full interface split is disproportionate to the surface (e.g., a mock test
double that intentionally overrides one method to throw). Test doubles that violate LSP
for the purpose of controlled failure in tests are an accepted trade-off — the violation
stays test-only and never enters production paths.

---

## 4. Interface Segregation Principle (ISP)

**def:** Clients should not be forced to depend on methods they do not use. Prefer many
small, role-specific interfaces over one large general-purpose interface.

**why:** A fat interface couples every implementor to every method, even unused ones. An
implementor that does not need `bulkDelete` still must stub it, and a caller that needs
only `findById` must import the whole contract.

**smell:** A `UserRepository` interface with 12 methods — `findById`, `findAll`,
`create`, `update`, `softDelete`, `hardDelete`, `bulkCreate`, `bulkDelete`,
`countByStatus`, `searchByName`, `exportToCsv`, `importFromCsv` — where most callers
use only two or three.

**fix:** Split into role interfaces: `UserReader` (`findById`, `findAll`, `countByStatus`,
`searchByName`), `UserWriter` (`create`, `update`), `UserBulkOps` (`bulkCreate`,
`bulkDelete`, `exportToCsv`, `importFromCsv`). Each caller depends on only the slice it
needs.

**when-NOT:** When the granularity produces interface-proliferation overhead that exceeds
the benefit — typically in small, single-consumer systems where splitting a 4-method
interface into two 2-method interfaces adds navigation cost with no decoupling gain.
ISP pays for itself when the interface has many implementations or many callers with
divergent needs.

---

## 5. Dependency Inversion Principle (DIP)

**def:** High-level modules should not depend on low-level modules. Both should depend on
abstractions. Abstractions should not depend on details; details should depend on
abstractions.

**why:** When a service directly instantiates its dependencies, swapping the dependency
(for testing, for a different provider, for a new environment) requires editing the
service. Inversion decouples the service from the concrete choice.

**smell:** `class OrderService { db = new PostgresClient(...); }` — the service owns the
DB client instance. Tests must connect to a real database or monkey-patch the constructor.

**fix:** Accept the dependency via constructor injection: `class OrderService {
constructor(private readonly db: DatabasePort) {} }`. Tests inject a fake; production
wires the real adapter.

**when-NOT:** When the abstraction is false — you know with certainty that only one
concrete implementation will ever exist and the lifecycle of the dependency is tied
trivially to the class (e.g., a pure helper instantiated inline with no external state).
Creating an interface for `class UuidGenerator { generate() { return crypto.randomUUID(); } }`
just to satisfy DIP imposes an abstraction layer with zero substitution benefit. Inject
only when you have a genuine reason to substitute.

---

## 6. DRY — Don't Repeat Yourself (+ Rule of Three)

**def:** Every piece of knowledge should have a single, authoritative representation in
the system. Duplication of knowledge — not merely textual similarity — is the target.
The **Rule of Three**: resist extracting an abstraction until a pattern recurs three
times; premature deduplication often picks the wrong abstraction.

**why:** When the same decision is encoded in multiple places, a change to that decision
requires updating every copy. Misses produce subtle divergence bugs that survive tests
because tests also hit only one copy.

**smell:** The same validation logic hand-rolled in three separate route handlers. Two
config objects with the same 12 fields differing by one key. A constant string (`"pending"`)
appearing verbatim in 8 files instead of `import { STATUS_PENDING } from './constants'`.

**fix:** Extract the authoritative representation — a shared function, a named constant,
a schema type — and import it everywhere. For knowledge that must exist in multiple
physical locations (e.g., a mirrored doc), add a parity test rather than relying on
human discipline.

**when-NOT:** When the duplication is incidental rather than shared knowledge. Two list-
rendering functions that happen to have similar `map()` + `filter()` shapes but operate
on unrelated domains and will diverge as requirements evolve should NOT be merged into
one abstraction. Premature deduplication of coincidentally-similar code produces
abstractions that are wrong by the time requirements diverge, and the refactor to split
them costs more than the original duplication. Apply the Rule of Three: extract only
after the third occurrence confirms the pattern is real.

---

## 7. KISS — Keep It Simple, Stupid

**def:** Systems work best when they are kept simple rather than made complicated.
Prefer the simplest solution that solves the actual problem.

**why:** Complexity is the primary source of bugs. Every abstraction layer, every
indirection, every DSL adds cognitive overhead for the next developer and another surface
where bugs can hide.

**smell:** A four-level factory hierarchy to instantiate a class that could be constructed
directly. A configuration file parsed by a custom mini-language when a plain JSON object
would suffice. A generic retry utility that takes a discriminant function, a backoff
strategy object, and a circuit-breaker adapter — when the call site is always the same
two lines with the same constants.

**fix:** Write the simple version first. Extract complexity only when the simple version
demonstrably fails to meet the requirement (e.g., the retry logic really does differ
across six call sites). Prefer concrete over abstract until abstraction earns its place.

**when-NOT:** When the problem domain is inherently complex and the "simple" implementation
buries complexity in the wrong place. A payment state machine with nine states that is
"simplified" by collapsing states into an if/else chain transfers the complexity into
branching logic that becomes unmaintainable faster than a proper state machine would.
KISS applies to the solution, not to a mischaracterized version of the problem.

---

## 8. YAGNI — You Aren't Gonna Need It

**def:** Do not add functionality until it is actually required. Build what you need now,
not what you might need someday.

**why:** Speculative features carry implementation cost, testing cost, documentation cost,
and ongoing maintenance cost — all paid in the present for a benefit that may never
materialize. They also introduce coupling that constrains future real decisions.

**smell:** A `flags` bitmask field added to a table "for future extensibility" with no
current flags defined. A plugin architecture built before there is a second plugin. An
abstract `NotificationChannel` interface with implementations for `Email`, `SMS`, `Push`,
and `Webhook` when only `Email` is used.

**fix:** Build the current requirement directly. When the second use case arrives, refactor
to the abstraction — the two concrete cases reveal the correct abstraction shape better
than speculation does.

**when-NOT:** When the future requirement is not speculative but contractual — an API
contract, a regulatory requirement, or an architectural constraint handed down from the
system design (e.g., a multi-tenant key column required by the hosting platform even
before the second tenant exists). Also, when the cost of retrofitting is dramatically
higher than adding the hook now (e.g., a database foreign key whose absence would require
a production data migration to add later). Make the distinction: "we might want" versus
"we are contractually obligated to support."

---

## 9. Law of Demeter (Principle of Least Knowledge)

**def:** A unit should talk only to its immediate neighbors. Specifically: a method `m`
of an object `O` may call methods only on: `O` itself, `m`'s parameters, objects `O`
creates, and `O`'s direct component/field objects. It should NOT reach into objects
returned by those calls.

**why:** `a.getB().getC().doSomething()` couples `a` to the internal structure of `B` and
the existence of `C` inside `B`. A structural change to `B` or `C` propagates up to
every caller that traverses the chain.

**smell:** `order.getCustomer().getAddress().getCity()` in a service method. A route
handler that does `ctx.request.headers.authorization.split(' ')[1]` three method calls
deep. A domain function that reaches into `config.database.pool.maxConnections`.

**fix:** Add a facade or delegation method at the right level: `order.getShippingCity()`
delegates internally. The caller knows only the immediate object it holds.

**when-NOT:** When the facade degrades the consuming interface to the point of absurdity
— adding fifty pass-through methods to a wrapper class, each a thin delegation,
defeats discoverability and maintainability. Fluent builder patterns (where chaining IS
the API contract) are an intentional exception. Also, ORMs and query builders deliberately
expose deep chains as their API surface; wrapping them adds cost without adding clarity.

---

## 10. Composition Over Inheritance

**def:** Prefer assembling behavior from composable parts (functions, interfaces, small
objects) over inheriting behavior from a base class hierarchy.

**why:** Inheritance creates tight coupling: a subclass depends on the internals of its
parent, cannot change the parent contract without risk, and cannot easily combine
behaviors from two class trees. Composition allows behavior to be mixed, replaced, and
tested independently.

**smell:** A five-level class hierarchy (`Animal → Mammal → Pet → Dog → Labrador`) where
each level adds two methods and overrides one. A base class whose constructor has a
dozen `this.feature = options.feature ?? defaultFeature()` initializations that
subclasses selectively override.

**fix:** Decompose into small collaborators (a `SwimmingBehavior`, a `BarkingBehavior`,
a `FetchingBehavior`). Compose the `Labrador` by holding instances of those behaviors.
Each behavior is testable in isolation; the `Labrador` is testable by injecting stubs.

**when-NOT:** When the domain is genuinely hierarchical and the IS-A relationship is
stable. A `PostgresConnection extends DatabaseConnection` in a polymorphic adapter layer,
where the base class provides real shared lifecycle logic (not just an empty interface),
is legitimate inheritance. The smell is in deep hierarchies and in using inheritance for
code reuse when the IS-A semantics are absent; shallow, semantically correct inheritance
is fine.

---

## 11. Pure Core / Imperative Shell

**def:** Separate the business logic (pure functions that take values and return values,
with no side effects) from the IO shell (the thin layer that reads inputs from the world,
calls the pure core, and writes outputs back to the world).

**why:** Pure functions are trivially testable (pass inputs, assert outputs), composable,
and free of timing bugs. IO is the source of flakiness, external dependencies, and hard-
to-reproduce failures. Keeping them separate contains the non-determinism to the shell.

**smell:** A service method that reads from the DB, applies business logic, conditionally
sends an email, and writes back to the DB — all interleaved. Testing any business-logic
branch requires stubbing the DB and the email client.

**fix:** Extract a pure domain function that takes DTOs and returns a result (no DB, no
email). The shell (service layer) calls the DB, passes the DTOs to the pure function,
reads the result, and calls the email client if the result says to. The pure function
is tested with plain values; the shell is tested with DB/email integration tests.

**when-NOT:** When the logic is inherently incremental or streaming and the intermediate
values are too large to hold in memory as pure data. A video transcoding pipeline cannot
practically materialize its entire state as a pure value; the imperative interleaving of
read-process-write is unavoidable. Similarly, a reactive event stream whose shape
emerges from interaction with external signals cannot be made pure without re-inventing
a monad. Apply pure-core where the data fits in memory and the decision tree is finite.

---

## 12. Separation of Concerns (SoC)

**def:** Divide a system into distinct sections, each addressing a separate concern.
Concerns include: presentation, business logic, data access, authentication, logging,
configuration.

**why:** When concerns are mixed, a change to one concern's requirements propagates into
other concerns' code. Testing a single concern requires setting up the full environment
of all concerns mixed with it.

**smell:** An MVC controller that fetches from the DB, applies a discount algorithm,
formats the response for the view, logs the request, and validates the auth token — all
in one method. Changes to the discount algorithm require opening the controller and risk
breaking the auth or the formatting.

**fix:** Route handler validates auth and parses input (presentation concern). Service
contains the discount algorithm (business logic concern). Repository encapsulates the
DB access (data access concern). Logger is cross-cutting but injected, not called inline.

**when-NOT:** When the "concern" is so thin that the abstraction boundary produces more
file-navigation overhead than the coupling it removes. A one-screen CRUD endpoint where
"separating" the three lines of business logic into its own module adds indirection for
no benefit. SoC scales with system complexity; in very small systems, the cost of the
additional layers exceeds the decoupling benefit.

---

## 13. Fail Fast

**def:** Detect and report errors as early as possible, as close as possible to the
point where the invalid condition occurred, rather than propagating bad state forward
until it causes an obscure failure downstream.

**why:** An invalid value allowed to travel through the system masks the original source
of the error. The exception or incorrect result eventually surfaces far from the cause,
with a stack trace that points at a symptom, not the root.

**smell:** A service that accepts `userId: string | null` and propagates it through three
service calls before a downstream DB query fails with "column cannot be null." The error
message names the DB column, not the missing userId. A function that returns `undefined`
on invalid input and lets callers `undefined`-check (or forget to).

**fix:** Validate at the boundary (the entry point of the system or subsystem). Reject
invalid input immediately with a clear error message naming the expected invariant.
Parse, do not validate: transform raw input into a typed value that cannot represent
the invalid state, so the rest of the system never sees it.

**when-NOT:** When "fail fast" would surface an error to the user that the system could
have recovered from automatically — a transient network error that a retry would resolve,
or a missing cache entry that can be populated on demand. Fail-fast on logic invariants;
retry on transient infrastructure failures. Distinguishing the two correctly is the
design judgment this principle demands.

---

## 14. Make Illegal States Unrepresentable

**def:** Design types and data structures so that invalid states cannot be constructed —
not merely so that they are checked at runtime. If the type system cannot represent the
invalid state, the invalid state cannot exist.

**why:** Runtime checks for invalid state are tested only as thoroughly as the tests cover
them. A type that makes the invalid state unrepresentable eliminates the entire class of
bugs structurally.

**smell:** `type Order = { status: 'shipped'; shippedAt?: Date }` — a `shipped` order
with no `shippedAt` is representable (the `?` allows it). Code everywhere must null-
check `shippedAt` even for shipped orders. `type User = { role: 'admin'; adminSince:
Date } | { role: 'user'; adminSince?: Date }` — same problem.

**fix:** Use discriminated unions: `type ShippedOrder = { status: 'shipped'; shippedAt:
Date }; type PendingOrder = { status: 'pending' }; type Order = ShippedOrder |
PendingOrder`. Now `shippedAt` is required for `ShippedOrder` and absent for
`PendingOrder`. The type system enforces the invariant.

**when-NOT:** When the type algebra to make a state unrepresentable is more complex than
the runtime check it replaces, and the domain evolves frequently enough that remodeling
the type for each new state is a constant maintenance burden. In schema-driven systems
(databases, JSON wire formats) the type system's expressive power is limited; adding
runtime validation at the boundary is the practical solution. Apply this principle most
aggressively in pure domain logic; at IO boundaries, validated parsing with explicit
errors is the realistic alternative.

---

## 15. Principle of Least Astonishment

**def:** A component should behave in the way its users (developers consuming the API)
would most reasonably expect, given the context and conventions of the surrounding
system.

**why:** Astonishing behavior — function names that do not match what they do, defaults
that differ from what the context implies, error handling that is inconsistent with sibling
functions — is a source of latent bugs. Developers trust the name; when the name lies,
they introduce bugs by acting on their (correct) expectation.

**smell:** A function named `getUser` that also creates the user if not found (side effect
astonishes). A `save()` method that returns a new copy of the object instead of mutating
in place, inconsistent with every other `save()` in the codebase. A config flag named
`dryRun: true` that actually executes writes (name inverted).

**fix:** Name functions to describe what they do completely (`getOrCreateUser`). Follow
the established conventions of the codebase — if every other save mutates in place, do
not return a new copy. If a flag name is ambiguous, prefer the positive form (`writeMode:
'live' | 'dry'`).

**when-NOT:** When "astonishing to newcomers" is "familiar to domain experts" — the
established idiom of the language, framework, or domain is the reference baseline, not
the intuition of someone unfamiliar with it. A Unix-style CLI tool where exit code 0
means success and non-zero means failure is not "astonishing" to a shell scripter even
if it surprises a JavaScript developer expecting a boolean. Orient toward the primary
audience of the API, not the broadest possible audience.
