import { expect, test } from "@playwright/test";

test("account code entry survives resend and verification failures", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { user: null } }));
  let requests = 0;
  await page.route("**/api/auth/code", (route) => {
    requests++;
    return requests === 1
      ? route.fulfill({ json: { codeLength: 4, message: "Use 9999" } })
      : route.fulfill({
          status: 429,
          json: { error: "Wait a minute before requesting another code." },
        });
  });
  let attempts = 0;
  await page.route("**/api/auth/verify", (route) => {
    attempts++;
    return route.fulfill({ status: 400, json: { error: "Incorrect sign-in code." } });
  });
  await page.goto("/vortoj/");
  await page.getByLabel("Email address").fill("review@example.test");
  await page.getByRole("button", { name: "Send sign-in code", exact: true }).click();
  await page.getByLabel("Sign-in code").fill("9999");
  await page.getByLabel("Your name", { exact: true }).fill("Review");
  await page.getByRole("button", { name: "Request another code", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Wait a minute before requesting another code.");
  await expect(page.getByLabel("Sign-in code")).toHaveValue("9999");
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue("Review");
  await expect(page.getByLabel("Email address")).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Incorrect sign-in code.");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Sign-in code")).toHaveValue("9999");
  expect(requests).toBe(2);
  expect(attempts).toBe(1);
});

test("malformed account responses remain recoverable", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { user: null } }));
  await page.route("**/api/auth/code", (route) =>
    route.fulfill({ json: { codeLength: 4, message: "Use 9999" } }),
  );
  await page.route("**/api/auth/verify", (route) => route.fulfill({ json: { user: null } }));
  await page.goto("/vortoj/");
  await page.getByLabel("Email address").fill("review@example.test");
  await page.getByRole("button", { name: "Send sign-in code", exact: true }).click();
  await page.getByLabel("Sign-in code").fill("9999");
  await page.getByLabel("Your name", { exact: true }).fill("Review");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Could not sign you in. Request another code and try again.",
  );
  await expect(
    page.getByRole("button", { name: "Request another code", exact: true }),
  ).toBeEnabled();
});
