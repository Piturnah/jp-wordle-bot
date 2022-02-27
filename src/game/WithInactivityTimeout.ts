import { MAX_INACTIVE_TIME } from "./Session";

export abstract class WithInactivityTimeout {
    private inactiveTimeout: ReturnType<typeof setTimeout>;

    constructor() {
        this.inactiveTimeout = this.set();
    }

    protected restartInactivityTimer() {
        clearTimeout(this.inactiveTimeout);

        this.inactiveTimeout = this.set();
    }

    private set(): ReturnType<typeof setTimeout> {
        return setTimeout(() => this.inactivityTimeout(), MAX_INACTIVE_TIME);
    }

    protected stopInactivityTimer() {
        clearTimeout(this.inactiveTimeout);
    }

    protected abstract inactivityTimeout(): void;
}
