import {
  CARESLINK_V1_RATE_CATALOG_VERSION,
  CARESLINK_V1_SHADOW_RATE_CATALOG,
  CaresLinkV1ContractError,
  assertCaresLinkV1IdempotencyKey,
  getCaresLinkV1Rate,
  type CaresLinkV1PointEvent,
  type CaresLinkV1PointQuote,
  type CaresLinkV1PointReservationStatus,
  type CaresLinkV1Rate,
  type CaresLinkV1ServiceCode,
} from "./shared-contracts";

export const CARESLINK_V1_WELCOME_POINTS = 300 as const;

export const CARESLINK_V1_POINT_LOT_SOURCES = [
  "WELCOME",
  "SUBSCRIPTION",
  "TOP_UP",
  "LEGACY_MIGRATION",
  "ADJUSTMENT",
] as const;
export type CaresLinkV1PointLotSource =
  (typeof CARESLINK_V1_POINT_LOT_SOURCES)[number];

export type CaresLinkV1PointWallet = {
  id: string;
  ownerUserId: string;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  shadow: true;
  createdAt: string;
  updatedAt: string;
};

export type CaresLinkV1PointLot = {
  id: string;
  walletId: string;
  ownerUserId: string;
  source: CaresLinkV1PointLotSource;
  sourceReference: string;
  originalPoints: number;
  remainingPoints: number;
  grantedAt: string;
  expiresAt?: string;
  shadow: true;
};

export type CaresLinkV1PointAllocation = {
  lotId: string;
  points: number;
};

export type CaresLinkV1PointReservation = {
  id: string;
  walletId: string;
  ownerUserId: string;
  quoteId: string;
  serviceCode: CaresLinkV1ServiceCode;
  catalogVersion: typeof CARESLINK_V1_RATE_CATALOG_VERSION;
  points: number;
  idempotencyKey: string;
  status: CaresLinkV1PointReservationStatus;
  allocations: CaresLinkV1PointAllocation[];
  resultRef?: string;
  reasonCode?: string;
  reservedAt: string;
  expiresAt: string;
  terminalAt?: string;
  shadow: true;
};

export type CaresLinkV1PointLedgerEntry = {
  id: string;
  walletId: string;
  ownerUserId: string;
  event: CaresLinkV1PointEvent;
  points: number;
  delta: number;
  lotId?: string;
  reservationId?: string;
  serviceCode?: CaresLinkV1ServiceCode;
  catalogVersion?: string;
  idempotencyKey?: string;
  sourceReference?: string;
  reasonCode?: string;
  resultRef?: string;
  allocations: CaresLinkV1PointAllocation[];
  createdAt: string;
  shadow: true;
};

export type CaresLinkV1PointSnapshot = {
  wallet: CaresLinkV1PointWallet;
  availablePoints: number;
  reservedPoints: number;
  lots: CaresLinkV1PointLot[];
  reservations: CaresLinkV1PointReservation[];
  ledger: CaresLinkV1PointLedgerEntry[];
};

export type CaresLinkV1PointsShadowStore = {
  kind: "memory-shadow";
  grantLot(input: {
    id: string;
    ledgerEntryId: string;
    walletId: string;
    ownerUserId: string;
    source: CaresLinkV1PointLotSource;
    sourceReference: string;
    points: number;
    expiresAt?: string;
    now?: string;
  }): Promise<CaresLinkV1PointLot>;
  createQuote(input: {
    id: string;
    ownerUserId: string;
    serviceCode: CaresLinkV1ServiceCode;
    quantity?: number;
    pointsOverride?: number;
    idempotencyKey: string;
    expiresAt: string;
    now?: string;
  }): Promise<CaresLinkV1PointQuote>;
  reserve(input: {
    id: string;
    ledgerEntryId: string;
    ownerUserId: string;
    quoteId: string;
    idempotencyKey: string;
    expiresAt: string;
    now?: string;
  }): Promise<CaresLinkV1PointReservation>;
  commit(input: {
    ownerUserId: string;
    reservationId: string;
    ledgerEntryId: string;
    resultRef: string;
    now?: string;
  }): Promise<CaresLinkV1PointReservation>;
  release(input: {
    ownerUserId: string;
    reservationId: string;
    ledgerEntryId: string;
    reasonCode: string;
    event?: "RELEASE" | "EXPIRE";
    now?: string;
  }): Promise<CaresLinkV1PointReservation>;
  getReservation(input: {
    ownerUserId: string;
    reservationId: string;
  }): Promise<CaresLinkV1PointReservation | undefined>;
  getSnapshot(
    ownerUserId: string,
    now?: string,
  ): Promise<CaresLinkV1PointSnapshot | undefined>;
};

export function createMemoryPointsShadowStore({
  rates = CARESLINK_V1_SHADOW_RATE_CATALOG,
}: {
  rates?: readonly CaresLinkV1Rate[];
} = {}): CaresLinkV1PointsShadowStore {
  const walletsByOwner = new Map<string, CaresLinkV1PointWallet>();
  const lots = new Map<string, CaresLinkV1PointLot>();
  const lotsByGrantReference = new Map<string, string>();
  const quotes = new Map<string, CaresLinkV1PointQuote>();
  const quoteKeys = new Map<string, string>();
  const reservations = new Map<string, CaresLinkV1PointReservation>();
  const reservationKeys = new Map<string, string>();
  const ledger = new Map<string, CaresLinkV1PointLedgerEntry>();

  return {
    kind: "memory-shadow",
    async grantLot({
      id,
      ledgerEntryId,
      walletId,
      ownerUserId,
      source,
      sourceReference,
      points,
      expiresAt,
      now = new Date().toISOString(),
    }) {
      assertIdentity(id, "Point lot ID");
      assertIdentity(ledgerEntryId, "Ledger entry ID");
      assertIdentity(walletId, "Wallet ID");
      assertIdentity(ownerUserId, "Owner user ID");
      assertSafeReference(sourceReference, "Source reference");
      assertPositiveInteger(points, "Grant points");
      assertFutureOptional(expiresAt, now, "Point lot expiry");

      const referenceKey = `${ownerUserId}:${source}:${sourceReference}`;
      const existingLotId = lotsByGrantReference.get(referenceKey);
      if (existingLotId) {
        const existing = lots.get(existingLotId);
        if (
          !existing ||
          existing.id !== id ||
          existing.originalPoints !== points ||
          existing.expiresAt !== expiresAt
        ) {
          throw idempotencyConflict();
        }

        return clone(existing);
      }

      const existingById = lots.get(id);
      if (existingById) {
        throw existingById.ownerUserId === ownerUserId
          ? idempotencyConflict()
          : forbidden();
      }

      const wallet = getOrCreateWallet({
        walletsByOwner,
        walletId,
        ownerUserId,
        now,
      });
      if (ledger.has(ledgerEntryId)) {
        throw idempotencyConflict();
      }

      const lot: CaresLinkV1PointLot = {
        id,
        walletId: wallet.id,
        ownerUserId,
        source,
        sourceReference,
        originalPoints: points,
        remainingPoints: points,
        grantedAt: now,
        expiresAt,
        shadow: true,
      };
      lots.set(id, lot);
      lotsByGrantReference.set(referenceKey, id);
      ledger.set(ledgerEntryId, {
        id: ledgerEntryId,
        walletId: wallet.id,
        ownerUserId,
        event: "GRANT",
        points,
        delta: points,
        lotId: id,
        sourceReference,
        allocations: [{ lotId: id, points }],
        createdAt: now,
        shadow: true,
      });

      return clone(lot);
    },
    async createQuote({
      id,
      ownerUserId,
      serviceCode,
      quantity = 1,
      pointsOverride,
      idempotencyKey,
      expiresAt,
      now = new Date().toISOString(),
    }) {
      assertIdentity(id, "Quote ID");
      assertIdentity(ownerUserId, "Owner user ID");
      assertCaresLinkV1IdempotencyKey(idempotencyKey);
      assertPositiveInteger(quantity, "Quote quantity");
      assertFuture(expiresAt, now, "Point quote expiry");

      const key = `${ownerUserId}:${serviceCode}:${idempotencyKey}`;
      const existingId = quoteKeys.get(key);
      if (existingId) {
        const existing = quotes.get(existingId);
        const points = resolveRatePoints(
          findRate(rates, serviceCode),
          quantity,
          pointsOverride,
        );
        if (
          !existing ||
          existing.id !== id ||
          existing.points !== points ||
          existing.quantity !== quantity ||
          existing.expiresAt !== expiresAt
        ) {
          throw idempotencyConflict();
        }

        return clone(existing);
      }

      const existingQuoteById = quotes.get(id);
      if (existingQuoteById) {
        throw existingQuoteById.ownerUserId === ownerUserId
          ? idempotencyConflict()
          : forbidden();
      }

      const rate = findRate(rates, serviceCode);
      const quote: CaresLinkV1PointQuote = {
        id,
        ownerUserId,
        serviceCode,
        catalogVersion: CARESLINK_V1_RATE_CATALOG_VERSION,
        points: resolveRatePoints(rate, quantity, pointsOverride),
        quantity,
        idempotencyKey,
        createdAt: now,
        expiresAt,
      };
      quotes.set(id, quote);
      quoteKeys.set(key, id);

      return clone(quote);
    },
    async reserve({
      id,
      ledgerEntryId,
      ownerUserId,
      quoteId,
      idempotencyKey,
      expiresAt,
      now = new Date().toISOString(),
    }) {
      assertIdentity(id, "Reservation ID");
      assertIdentity(ledgerEntryId, "Ledger entry ID");
      assertCaresLinkV1IdempotencyKey(idempotencyKey);
      assertFuture(expiresAt, now, "Point reservation expiry");
      const quote = requireOwnedQuote(quotes, quoteId, ownerUserId);
      if (Date.parse(quote.expiresAt) <= Date.parse(now)) {
        throw new CaresLinkV1ContractError(
          "POINT_QUOTE_EXPIRED",
          "The point quote has expired",
        );
      }
      if (quote.points <= 0) {
        throw new CaresLinkV1ContractError(
          "INVALID_STATE_TRANSITION",
          "A zero-point service does not require a reservation",
        );
      }

      const key = `${ownerUserId}:${quote.serviceCode}:${idempotencyKey}`;
      const existingId = reservationKeys.get(key);
      if (existingId) {
        const existing = reservations.get(existingId);
        if (!existing || existing.id !== id || existing.quoteId !== quoteId) {
          throw idempotencyConflict();
        }

        return clone(existing);
      }

      if (reservations.has(id) || ledger.has(ledgerEntryId)) {
        throw idempotencyConflict();
      }

      const wallet = walletsByOwner.get(ownerUserId);
      if (!wallet || wallet.status !== "ACTIVE") {
        throw new CaresLinkV1ContractError(
          "POINTS_INSUFFICIENT",
          "No active shadow wallet is available",
        );
      }

      const eligibleLots = getEligibleLots(lots, wallet, now);
      const available = eligibleLots.reduce(
        (total, lot) => total + lot.remainingPoints,
        0,
      );
      if (available < quote.points) {
        throw new CaresLinkV1ContractError(
          "POINTS_INSUFFICIENT",
          "The shadow wallet does not have enough points",
        );
      }

      const reservationExpiresAt =
        Date.parse(expiresAt) < Date.parse(quote.expiresAt)
          ? expiresAt
          : quote.expiresAt;

      let outstanding = quote.points;
      const allocations: CaresLinkV1PointAllocation[] = [];
      for (const lot of eligibleLots) {
        if (outstanding === 0) {
          break;
        }

        const points = Math.min(lot.remainingPoints, outstanding);
        allocations.push({ lotId: lot.id, points });
        lots.set(lot.id, {
          ...lot,
          remainingPoints: lot.remainingPoints - points,
        });
        outstanding -= points;
      }

      const reservation: CaresLinkV1PointReservation = {
        id,
        walletId: wallet.id,
        ownerUserId,
        quoteId,
        serviceCode: quote.serviceCode,
        catalogVersion: quote.catalogVersion,
        points: quote.points,
        idempotencyKey,
        status: "RESERVED",
        allocations,
        reservedAt: now,
        expiresAt: reservationExpiresAt,
        shadow: true,
      };
      reservations.set(id, reservation);
      reservationKeys.set(key, id);
      ledger.set(ledgerEntryId, {
        id: ledgerEntryId,
        walletId: wallet.id,
        ownerUserId,
        event: "RESERVE",
        points: quote.points,
        delta: -quote.points,
        reservationId: id,
        serviceCode: quote.serviceCode,
        catalogVersion: quote.catalogVersion,
        idempotencyKey,
        allocations: clone(allocations),
        createdAt: now,
        shadow: true,
      });

      return clone(reservation);
    },
    async commit({
      ownerUserId,
      reservationId,
      ledgerEntryId,
      resultRef,
      now = new Date().toISOString(),
    }) {
      const reservation = requireOwnedReservation(
        reservations,
        reservationId,
        ownerUserId,
      );
      if (reservation.status === "COMMITTED") {
        if (reservation.resultRef !== resultRef) {
          throw idempotencyConflict();
        }
        return clone(reservation);
      }
      if (reservation.status !== "RESERVED") {
        throw new CaresLinkV1ContractError(
          "INVALID_STATE_TRANSITION",
          "Only a reserved point transaction can be committed",
        );
      }
      if (Date.parse(reservation.expiresAt) <= Date.parse(now)) {
        throw new CaresLinkV1ContractError(
          "POINT_QUOTE_EXPIRED",
          "The point reservation has expired and must be released",
        );
      }
      assertSafeReference(resultRef, "Result reference");

      const existingLedger = ledger.get(ledgerEntryId);
      if (existingLedger) {
        throw idempotencyConflict();
      }

      const committed: CaresLinkV1PointReservation = {
        ...reservation,
        status: "COMMITTED",
        resultRef,
        terminalAt: now,
      };
      reservations.set(reservationId, committed);
      ledger.set(ledgerEntryId, {
        id: ledgerEntryId,
        walletId: reservation.walletId,
        ownerUserId,
        event: "COMMIT",
        points: reservation.points,
        delta: 0,
        reservationId,
        serviceCode: reservation.serviceCode,
        catalogVersion: reservation.catalogVersion,
        idempotencyKey: reservation.idempotencyKey,
        resultRef,
        allocations: clone(reservation.allocations),
        createdAt: now,
        shadow: true,
      });

      return clone(committed);
    },
    async release({
      ownerUserId,
      reservationId,
      ledgerEntryId,
      reasonCode,
      event = "RELEASE",
      now = new Date().toISOString(),
    }) {
      const reservation = requireOwnedReservation(
        reservations,
        reservationId,
        ownerUserId,
      );
      if (reservation.status === "RELEASED" || reservation.status === "EXPIRED") {
        const expectedStatus = event === "EXPIRE" ? "EXPIRED" : "RELEASED";
        if (
          reservation.status !== expectedStatus ||
          reservation.reasonCode !== reasonCode
        ) {
          throw idempotencyConflict();
        }
        return clone(reservation);
      }
      if (reservation.status !== "RESERVED") {
        throw new CaresLinkV1ContractError(
          "INVALID_STATE_TRANSITION",
          "Committed points cannot be released",
        );
      }
      assertSafeReference(reasonCode, "Release reason code");
      if (ledger.has(ledgerEntryId)) {
        throw idempotencyConflict();
      }

      for (const allocation of reservation.allocations) {
        const lot = lots.get(allocation.lotId);
        if (!lot || lot.ownerUserId !== ownerUserId) {
          throw forbidden();
        }
        if (lot.remainingPoints + allocation.points > lot.originalPoints) {
          throw new CaresLinkV1ContractError(
            "INVALID_STATE_TRANSITION",
            "Point release would exceed the original lot",
          );
        }

        lots.set(lot.id, {
          ...lot,
          remainingPoints: lot.remainingPoints + allocation.points,
        });
      }

      const status = event === "EXPIRE" ? "EXPIRED" : "RELEASED";
      const released: CaresLinkV1PointReservation = {
        ...reservation,
        status,
        reasonCode,
        terminalAt: now,
      };
      reservations.set(reservationId, released);
      ledger.set(ledgerEntryId, {
        id: ledgerEntryId,
        walletId: reservation.walletId,
        ownerUserId,
        event,
        points: reservation.points,
        delta: reservation.points,
        reservationId,
        serviceCode: reservation.serviceCode,
        catalogVersion: reservation.catalogVersion,
        idempotencyKey: reservation.idempotencyKey,
        reasonCode,
        allocations: clone(reservation.allocations),
        createdAt: now,
        shadow: true,
      });

      return clone(released);
    },
    async getReservation({ ownerUserId, reservationId }) {
      const reservation = reservations.get(reservationId);
      return reservation?.ownerUserId === ownerUserId
        ? clone(reservation)
        : undefined;
    },
    async getSnapshot(ownerUserId, now = new Date().toISOString()) {
      const wallet = walletsByOwner.get(ownerUserId);
      if (!wallet) {
        return undefined;
      }

      const ownerLots = Array.from(lots.values()).filter(
        (lot) => lot.ownerUserId === ownerUserId,
      );
      const ownerReservations = Array.from(reservations.values()).filter(
        (reservation) => reservation.ownerUserId === ownerUserId,
      );
      const ownerLedger = Array.from(ledger.values()).filter(
        (entry) => entry.ownerUserId === ownerUserId,
      );

      return clone({
        wallet,
        availablePoints: ownerLots.reduce(
          (total, lot) =>
            total +
            (!lot.expiresAt || Date.parse(lot.expiresAt) > Date.parse(now)
              ? lot.remainingPoints
              : 0),
          0,
        ),
        reservedPoints: ownerReservations
          .filter((reservation) => reservation.status === "RESERVED")
          .reduce((total, reservation) => total + reservation.points, 0),
        lots: ownerLots.sort(compareLots),
        reservations: ownerReservations.sort((left, right) =>
          left.reservedAt.localeCompare(right.reservedAt),
        ),
        ledger: ownerLedger.sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt),
        ),
      });
    },
  };
}

function getOrCreateWallet({
  walletsByOwner,
  walletId,
  ownerUserId,
  now,
}: {
  walletsByOwner: Map<string, CaresLinkV1PointWallet>;
  walletId: string;
  ownerUserId: string;
  now: string;
}) {
  const existing = walletsByOwner.get(ownerUserId);
  if (existing) {
    if (existing.id !== walletId) {
      throw idempotencyConflict();
    }
    return existing;
  }

  const wallet: CaresLinkV1PointWallet = {
    id: walletId,
    ownerUserId,
    status: "ACTIVE",
    shadow: true,
    createdAt: now,
    updatedAt: now,
  };
  walletsByOwner.set(ownerUserId, wallet);
  return wallet;
}

function findRate(
  rates: readonly CaresLinkV1Rate[],
  serviceCode: CaresLinkV1ServiceCode,
) {
  return (
    rates.find((candidate) => candidate.serviceCode === serviceCode) ??
    getCaresLinkV1Rate(serviceCode)
  );
}

function resolveRatePoints(
  rate: CaresLinkV1Rate,
  quantity: number,
  pointsOverride: number | undefined,
) {
  if (rate.points !== null) {
    if (pointsOverride !== undefined && pointsOverride !== rate.points) {
      throw new CaresLinkV1ContractError(
        "IDEMPOTENCY_CONFLICT",
        "Fixed-rate services do not accept a point override",
      );
    }
    return rate.points * quantity;
  }

  if (
    pointsOverride === undefined ||
    !Number.isInteger(pointsOverride) ||
    pointsOverride < (rate.minimumPoints ?? 0) ||
    pointsOverride > (rate.maximumPoints ?? Number.MAX_SAFE_INTEGER)
  ) {
    throw new CaresLinkV1ContractError(
      "POINTS_INSUFFICIENT",
      "A server-approved point quote is required for this variable-rate service",
    );
  }

  return pointsOverride * quantity;
}

function getEligibleLots(
  lots: Map<string, CaresLinkV1PointLot>,
  wallet: CaresLinkV1PointWallet,
  now: string,
) {
  const nowMs = Date.parse(now);
  return Array.from(lots.values())
    .filter(
      (lot) =>
        lot.walletId === wallet.id &&
        lot.ownerUserId === wallet.ownerUserId &&
        lot.remainingPoints > 0 &&
        (!lot.expiresAt || Date.parse(lot.expiresAt) > nowMs),
    )
    .sort(compareLots);
}

function compareLots(left: CaresLinkV1PointLot, right: CaresLinkV1PointLot) {
  const leftExpiry = left.expiresAt
    ? Date.parse(left.expiresAt)
    : Number.POSITIVE_INFINITY;
  const rightExpiry = right.expiresAt
    ? Date.parse(right.expiresAt)
    : Number.POSITIVE_INFINITY;
  if (leftExpiry !== rightExpiry) {
    return leftExpiry - rightExpiry;
  }

  const sourceDifference = sourcePriority(left.source) - sourcePriority(right.source);
  if (sourceDifference !== 0) {
    return sourceDifference;
  }

  const grantedDifference = left.grantedAt.localeCompare(right.grantedAt);
  return grantedDifference || left.id.localeCompare(right.id);
}

function sourcePriority(source: CaresLinkV1PointLotSource) {
  return source === "TOP_UP" ? 1 : 0;
}

function requireOwnedQuote(
  quotes: Map<string, CaresLinkV1PointQuote>,
  quoteId: string,
  ownerUserId: string,
) {
  const quote = quotes.get(quoteId);
  if (!quote || quote.ownerUserId !== ownerUserId) {
    throw forbidden();
  }
  return quote;
}

function requireOwnedReservation(
  reservations: Map<string, CaresLinkV1PointReservation>,
  reservationId: string,
  ownerUserId: string,
) {
  const reservation = reservations.get(reservationId);
  if (!reservation || reservation.ownerUserId !== ownerUserId) {
    throw forbidden();
  }
  return reservation;
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CaresLinkV1ContractError(
      "MINIMUM_FACTS_REQUIRED",
      `${label} must be a positive integer`,
    );
  }
}

function assertFuture(value: string, now: string, label: string) {
  if (!Number.isFinite(Date.parse(value)) || Date.parse(value) <= Date.parse(now)) {
    throw new CaresLinkV1ContractError(
      "POINT_QUOTE_EXPIRED",
      `${label} must be in the future`,
    );
  }
}

function assertFutureOptional(
  value: string | undefined,
  now: string,
  label: string,
) {
  if (value !== undefined) {
    assertFuture(value, now, label);
  }
}

function assertSafeReference(value: string, label: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)) {
    throw new CaresLinkV1ContractError(
      "MINIMUM_FACTS_REQUIRED",
      `${label} is invalid`,
    );
  }
}

function assertIdentity(value: string, label: string) {
  if (!value.trim() || value.length > 160) {
    throw new CaresLinkV1ContractError(
      "MINIMUM_FACTS_REQUIRED",
      `${label} is invalid`,
    );
  }
}

function forbidden() {
  return new CaresLinkV1ContractError(
    "FORBIDDEN",
    "The requested resource is unavailable",
  );
}

function idempotencyConflict() {
  return new CaresLinkV1ContractError(
    "IDEMPOTENCY_CONFLICT",
    "The idempotency key was already used for different input",
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
