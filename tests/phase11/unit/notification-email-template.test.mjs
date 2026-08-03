import assert from "node:assert/strict";
import test from "node:test";

import { renderNotificationEmailHtml } from "../../../src/lib/email/templates/notification-email.ts";

test("escapes HTML-significant characters in the title", () => {
  const html = renderNotificationEmailHtml({
    title: '<script>alert("x")</script>',
    message: null,
    actionUrl: null,
    actionLabel: null,
  });

  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
});

test("escapes HTML-significant characters in the message", () => {
  const html = renderNotificationEmailHtml({
    title: "Safe title",
    message: "5 < 10 & \"quoted\" <b>bold</b>",
    actionUrl: null,
    actionLabel: null,
  });

  assert.doesNotMatch(html, /<b>bold<\/b>/);
  assert.match(html, /5 &lt; 10 &amp; &quot;quoted&quot; &lt;b&gt;bold&lt;\/b&gt;/);
});

test("escapes the action URL and label", () => {
  const html = renderNotificationEmailHtml({
    title: "Safe title",
    message: null,
    actionUrl: 'https://example.com/"><script>alert(1)</script>',
    actionLabel: "<b>Click</b>",
  });

  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<b>Click<\/b>/);
});

test("omits the action block entirely when no actionUrl/actionLabel is given", () => {
  const html = renderNotificationEmailHtml({
    title: "Safe title",
    message: null,
    actionUrl: null,
    actionLabel: null,
  });

  assert.doesNotMatch(html, /<a href=/);
});

test("renders the action link when both actionUrl and actionLabel are given", () => {
  const html = renderNotificationEmailHtml({
    title: "Safe title",
    message: null,
    actionUrl: "https://app.nexfora.test/admin/leads/123",
    actionLabel: "View in Nexfora",
  });

  assert.match(html, /<a href="https:\/\/app\.nexfora\.test\/admin\/leads\/123"/);
  assert.match(html, />View in Nexfora<\/a>/);
});

test("omits the message paragraph entirely when message is null", () => {
  const html = renderNotificationEmailHtml({
    title: "Safe title",
    message: null,
    actionUrl: null,
    actionLabel: null,
  });

  const titleOccurrences = html.split("Safe title").length - 1;
  assert.equal(titleOccurrences, 1);
});

test("is a complete, well-formed HTML document", () => {
  const html = renderNotificationEmailHtml({
    title: "Safe title",
    message: "A message.",
    actionUrl: "https://app.nexfora.test/admin/leads/123",
    actionLabel: "View",
  });

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<\/html>$/);
});
