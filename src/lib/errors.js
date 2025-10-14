/* eslint-disable max-classes-per-file */
/* eslint-disable import/prefer-default-export */
export class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = this.constructor.name
  }
}

export class NotFoundError extends Error {
  constructor(message) {
    super(message)
    this.name = this.constructor.name
  }
}

export class ForbiddenError extends Error {
  constructor(message) {
    super(message)
    this.name = this.constructor.name
  }
}
