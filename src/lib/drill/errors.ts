/** An optimistic write lost to another turn or finish request. Never use for outages. */
export class DrillVersionConflict extends Error {
  constructor() {
    super("version conflict");
    this.name = "DrillVersionConflict";
  }
}
