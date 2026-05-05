import { afterAll, afterEach, beforeAll } from "vitest";
import nock from "nock";

beforeAll(() => {
  nock.disableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});
