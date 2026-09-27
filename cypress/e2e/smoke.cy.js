describe("Unauthenticated browser smoke", () => {
   it("loads sign-in and shows a useful error on rejected authentication", () => {
      cy.intercept(
         "POST",
         "https://example.supabase.co/auth/v1/token*",
         {
            statusCode: 400,
            body: {
               error: "invalid_grant",
               error_description:
                  "Invalid login credentials",
            },
         },
      ).as("rejectedLogin");

      cy.visit("/signin");
      cy.contains("h1", "Sign into your account").should(
         "be.visible",
      );
      cy.get('input[type="email"]').type(
         "smoke@example.test",
      );
      cy.get('input[type="password"]').type(
         "incorrect-password",
      );
      cy.get('button[type="submit"]').click();
      cy.wait("@rejectedLogin");
      cy.contains("Invalid login credentials").should(
         "be.visible",
      );
      cy.url().should("include", "/signin");
   });
});
