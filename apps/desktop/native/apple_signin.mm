// Native Sign in with Apple for the macOS app (AuthenticationServices), exposed
// to the Electron main process through Node-API. Built by scripts/build-native.sh
// as a universal (arm64 + x86_64) .node. It only works in a build signed with a
// provisioning profile that carries com.apple.developer.applesignin (the App
// Store build); anywhere else Apple answers with an error and the caller hides
// the button. See docs/MACOS.md.
//
//   isAvailable() -> boolean
//   signIn(nsViewHandle: Buffer, hashedNonce: string, wantNameAndEmail: boolean)
//     -> Promise<{ identityToken, authorizationCode, user, email, givenName, familyName }>
//        rejects with Error{ code: 'canceled' | 'failed' }

#import <AppKit/AppKit.h>
#import <AuthenticationServices/AuthenticationServices.h>
#include <node_api.h>
#include <string>

struct Outcome {
  bool ok = false;
  std::string code, message;
  std::string identityToken, authorizationCode, user, email, givenName, familyName;
};

@interface CMAppleSignIn : NSObject <ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding>
@property(nonatomic, strong) NSWindow *anchor;
@property(nonatomic, strong) ASAuthorizationController *controller;
@property(nonatomic, assign) napi_threadsafe_function tsfn;
@end

static NSMutableSet *gInFlight; // keeps each request alive until Apple answers

static std::string str(NSString *s) { return s ? std::string(s.UTF8String) : std::string(); }

@implementation CMAppleSignIn
- (ASPresentationAnchor)presentationAnchorForAuthorizationController:(ASAuthorizationController *)controller {
  return self.anchor ?: NSApp.keyWindow ?: NSApp.windows.firstObject;
}
- (void)finish:(Outcome *)outcome {
  napi_call_threadsafe_function(self.tsfn, outcome, napi_tsfn_blocking);
  napi_release_threadsafe_function(self.tsfn, napi_tsfn_release);
  [gInFlight removeObject:self];
}
- (void)authorizationController:(ASAuthorizationController *)controller didCompleteWithAuthorization:(ASAuthorization *)authorization {
  auto *o = new Outcome();
  if ([authorization.credential isKindOfClass:[ASAuthorizationAppleIDCredential class]]) {
    ASAuthorizationAppleIDCredential *c = (ASAuthorizationAppleIDCredential *)authorization.credential;
    o->ok = c.identityToken != nil;
    o->identityToken = c.identityToken ? std::string((const char *)c.identityToken.bytes, c.identityToken.length) : "";
    o->authorizationCode = c.authorizationCode ? std::string((const char *)c.authorizationCode.bytes, c.authorizationCode.length) : "";
    o->user = str(c.user);
    o->email = str(c.email);
    o->givenName = str(c.fullName.givenName);
    o->familyName = str(c.fullName.familyName);
    if (!o->ok) { o->code = "failed"; o->message = "Apple returned no identity token."; }
  } else {
    o->code = "failed";
    o->message = "Unexpected credential type.";
  }
  [self finish:o];
}
- (void)authorizationController:(ASAuthorizationController *)controller didCompleteWithError:(NSError *)error {
  auto *o = new Outcome();
  o->code = error.code == ASAuthorizationErrorCanceled ? "canceled" : "failed";
  o->message = str(error.localizedDescription) + " (" + str(error.domain) + " " + std::to_string((long)error.code) + ")";
  [self finish:o];
}
@end

static void setStr(napi_env env, napi_value obj, const char *key, const std::string &v) {
  napi_value s;
  napi_create_string_utf8(env, v.c_str(), v.size(), &s);
  napi_set_named_property(env, obj, key, s);
}

// Runs on the JS (main) thread: settle the promise.
static void Settle(napi_env env, napi_value /*js_cb*/, void *context, void *data) {
  auto deferred = (napi_deferred)context;
  auto *o = (Outcome *)data;
  if (env) {
    if (o->ok) {
      napi_value obj;
      napi_create_object(env, &obj);
      setStr(env, obj, "identityToken", o->identityToken);
      setStr(env, obj, "authorizationCode", o->authorizationCode);
      setStr(env, obj, "user", o->user);
      setStr(env, obj, "email", o->email);
      setStr(env, obj, "givenName", o->givenName);
      setStr(env, obj, "familyName", o->familyName);
      napi_resolve_deferred(env, deferred, obj);
    } else {
      napi_value msg, code, err;
      napi_create_string_utf8(env, o->message.c_str(), o->message.size(), &msg);
      napi_create_string_utf8(env, o->code.c_str(), o->code.size(), &code);
      napi_create_error(env, code, msg, &err);
      napi_reject_deferred(env, deferred, err);
    }
  }
  delete o;
}

static napi_value IsAvailable(napi_env env, napi_callback_info) {
  napi_value b;
  bool ok = false;
  if (@available(macOS 10.15, *)) ok = true;
  napi_get_boolean(env, ok, &b);
  return b;
}

static napi_value SignIn(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  NSWindow *anchor = nil;
  bool isBuf = false;
  if (argc > 0) napi_is_buffer(env, argv[0], &isBuf);
  if (isBuf) {
    void *data; size_t len;
    napi_get_buffer_info(env, argv[0], &data, &len);
    if (len >= sizeof(void *)) {
      NSView *view = (__bridge NSView *)(*(void **)data);
      anchor = view.window;
    }
  }
  std::string nonce;
  if (argc > 1) {
    size_t n = 0;
    napi_get_value_string_utf8(env, argv[1], nullptr, 0, &n);
    nonce.resize(n + 1);
    napi_get_value_string_utf8(env, argv[1], nonce.data(), n + 1, &n);
    nonce.resize(n);
  }
  bool wantScopes = true;
  if (argc > 2) napi_get_value_bool(env, argv[2], &wantScopes);

  napi_deferred deferred;
  napi_value promise;
  napi_create_promise(env, &deferred, &promise);

  napi_value name;
  napi_create_string_utf8(env, "appleSignIn", NAPI_AUTO_LENGTH, &name);
  napi_threadsafe_function tsfn;
  napi_create_threadsafe_function(env, nullptr, nullptr, name, 0, 1, nullptr, nullptr, deferred, Settle, &tsfn);

  if (!gInFlight) gInFlight = [NSMutableSet new];
  ASAuthorizationAppleIDRequest *request = [[ASAuthorizationAppleIDProvider new] createRequest];
  if (wantScopes) request.requestedScopes = @[ ASAuthorizationScopeFullName, ASAuthorizationScopeEmail ];
  if (!nonce.empty()) request.nonce = [NSString stringWithUTF8String:nonce.c_str()];

  CMAppleSignIn *h = [CMAppleSignIn new];
  h.anchor = anchor;
  h.tsfn = tsfn;
  h.controller = [[ASAuthorizationController alloc] initWithAuthorizationRequests:@[ request ]];
  h.controller.delegate = h;
  h.controller.presentationContextProvider = h;
  [gInFlight addObject:h];
  [h.controller performRequests];
  return promise;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "isAvailable", NAPI_AUTO_LENGTH, IsAvailable, nullptr, &fn);
  napi_set_named_property(env, exports, "isAvailable", fn);
  napi_create_function(env, "signIn", NAPI_AUTO_LENGTH, SignIn, nullptr, &fn);
  napi_set_named_property(env, exports, "signIn", fn);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
