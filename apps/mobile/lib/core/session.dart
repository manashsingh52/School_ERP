import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'api_error.dart';
import 'config.dart';
import 'models.dart';
import 'token_store.dart';

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());
final apiProvider = Provider<ApiClient>((ref) => ApiClient(ref.watch(tokenStoreProvider)));

sealed class SessionState {
  const SessionState();
}

class SessionLoading extends SessionState {
  const SessionLoading();
}

class SignedOut extends SessionState {
  const SignedOut([this.message]);
  final String? message;
}

/// Signed in, more than one school: the user picks one.
class ChoosingSchool extends SessionState {
  const ChoosingSchool(this.user, this.memberships);
  final UserInfo user;
  final List<Membership> memberships;
}

class SignedIn extends SessionState {
  const SignedIn(this.me);
  final Me me;
}

/// One login, many schools (docs/03): sign in → pick a school → school-scoped token.
class SessionController extends Notifier<SessionState> {
  ApiClient get _api => ref.read(apiProvider);
  TokenStore get _tokens => ref.read(tokenStoreProvider);

  @override
  SessionState build() {
    ref.read(apiProvider).onSignedOut = () => state = const SignedOut('Please sign in again.');
    Future.microtask(restore);
    return const SessionLoading();
  }

  Map<String, Object?> get _device => {'platform': clientPlatform, 'deviceName': 'SchoolOS app'};

  /// App start: a saved refresh token → a fresh access token → straight back into the school.
  Future<void> restore() async {
    if (await _tokens.readRefresh() == null) {
      state = const SignedOut();
      return;
    }
    try {
      // Any authenticated call refreshes the access token first (it isn't kept on disk).
      final me = Me.fromJson(await _api.get<Json>('/me'));
      if (me.membership != null) {
        state = SignedIn(me);
        return;
      }
      final saved = await _tokens.readMembership();
      if (saved != null && me.memberships.any((m) => m.id == saved)) return await selectSchool(saved);
      if (me.memberships.length == 1) return await selectSchool(me.memberships.single.id);
      state = ChoosingSchool(me.user, me.memberships);
    } on ApiException catch (e) {
      if (e.isNetwork) {
        state = SignedOut(e.message);
      } else {
        await _tokens.clear();
        state = const SignedOut();
      }
    }
  }

  Future<void> _afterAuth(Json auth) async {
    final tokens = auth['tokens'] as Json;
    _tokens.accessToken = tokens['accessToken'] as String;
    await _tokens.saveRefresh(tokens['refreshToken'] as String);
    final memberships = (auth['memberships'] as List).cast<Json>().map(Membership.fromJson).toList();
    final active = auth['activeMembershipId'] as String?;
    if (active != null) {
      await _tokens.saveMembership(active);
      await _loadMe();
    } else if (memberships.isEmpty) {
      await signOut(message: "Your account isn't linked to a school yet. Ask the school office to invite you.");
    } else {
      state = ChoosingSchool(UserInfo.fromJson(auth['user'] as Json), memberships);
    }
  }

  Future<void> signInWithPassword(String identifier, String password) async {
    final auth = await _api.post<Json>('/auth/login', {'identifier': identifier.trim(), 'password': password, ..._device});
    await _afterAuth(auth);
  }

  /// Returns the challenge id to verify against.
  Future<String> sendCode(String phone) async {
    final res = await _api.post<Json>('/auth/otp/send', {'phone': phone.trim(), 'purpose': 'LOGIN'});
    return res['challengeId'] as String;
  }

  Future<void> verifyCode(String challengeId, String code) async {
    final auth = await _api.post<Json>('/auth/otp/verify', {'challengeId': challengeId, 'code': code.trim(), ..._device});
    await _afterAuth(auth);
  }

  Future<void> selectSchool(String membershipId) async {
    final res = await _api.post<Json>('/auth/select-school', {'membershipId': membershipId});
    _tokens.accessToken = res['accessToken'] as String;
    await _tokens.saveMembership(membershipId);
    await _loadMe();
  }

  Future<void> _loadMe() async => state = SignedIn(Me.fromJson(await _api.get<Json>('/me')));

  /// Back to the school list (for people in more than one school).
  Future<void> switchSchool() async {
    final me = (state as SignedIn).me;
    state = ChoosingSchool(me.user, me.memberships);
  }

  Future<void> signOut({String? message}) async {
    try {
      await _api.post<Object?>('/auth/logout');
    } on ApiException {
      // Signing out locally is what matters; the session expires on its own.
    }
    await _tokens.clear();
    state = SignedOut(message);
  }
}

final sessionProvider = NotifierProvider<SessionController, SessionState>(SessionController.new);

/// The signed-in member (only read under the signed-in shell).
final meProvider = Provider<Me>((ref) {
  final s = ref.watch(sessionProvider);
  if (s is SignedIn) return s.me;
  throw StateError('Not signed in');
});

/// Someone who is both a parent and a teacher switches between the two homes.
enum AppMode { parent, teacher }

class ModeController extends Notifier<AppMode> {
  @override
  AppMode build() {
    final me = ref.watch(meProvider);
    return me.isTeacher ? AppMode.teacher : AppMode.parent;
  }

  void set(AppMode mode) => state = mode;
}

final modeProvider = NotifierProvider<ModeController, AppMode>(ModeController.new);

/// The child a parent is looking at (header chip). Defaults to the first child.
class ChildController extends Notifier<Child?> {
  @override
  Child? build() {
    final children = ref.watch(meProvider).children;
    return children.isEmpty ? null : children.first;
  }

  void select(Child c) => state = c;
}

final childProvider = NotifierProvider<ChildController, Child?>(ChildController.new);

final appConfigProvider = FutureProvider<AppConfig>((ref) async => AppConfig.fromJson(await ref.read(apiProvider).get<Json>('/app/config')));
