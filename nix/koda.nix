{
  lib,
  stdenvNoCC,
  callPackage,
  bun,
  bubblewrap,
  nodejs,
  sysctl,
  makeBinaryWrapper,
  models-dev,
  ripgrep,
  installShellFiles,
  versionCheckHook,
  writableTmpDirAsHomeHook,
  node_modules ? callPackage ./node-modules.nix { },
}:
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "koda";
  inherit (node_modules) version src;
  inherit node_modules;

  nativeBuildInputs = [
    bun
    nodejs # for patchShebangs node_modules
    installShellFiles
    makeBinaryWrapper
    models-dev
    writableTmpDirAsHomeHook
  ];

  configurePhase = ''
    runHook preConfigure

    cp -R ${finalAttrs.node_modules}/. .
    patchShebangs node_modules
    patchShebangs packages/*/node_modules

    runHook postConfigure
  '';

  env.MODELS_DEV_API_JSON = "${models-dev}/dist/_api.json";
  env.koda_DISABLE_MODELS_FETCH = true;
  env.koda_SKIP_BUNDLED_BWRAP = "1";
  env.koda_VERSION = finalAttrs.version;
  env.koda_CHANNEL = "local";

  buildPhase = ''
    runHook preBuild

    cd ./packages/opencode
    bun --bun ./script/build.ts --single --skip-install
    bun --bun ./script/schema.ts schema.json

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    install -Dm755 dist/@koda-code/cli-*/bin/koda $out/bin/koda
    install -Dm644 schema.json $out/share/koda/schema.json

    wrapProgram $out/bin/koda \
      ${lib.optionalString stdenvNoCC.hostPlatform.isLinux "--set koda_BWRAP_PATH ${bubblewrap}/bin/bwrap"} \
      --prefix PATH : ${
        lib.makeBinPath (
          [
            ripgrep
          ]
          # bun runs sysctl to detect if running on rosetta2
          ++ lib.optional stdenvNoCC.hostPlatform.isDarwin sysctl
        )
      }

    runHook postInstall
  '';

  postInstall = lib.optionalString (stdenvNoCC.buildPlatform.canExecute stdenvNoCC.hostPlatform) ''
    # trick yargs into also generating zsh completions
    installShellCompletion --cmd koda \
      --bash <($out/bin/koda completion) \
      --zsh <(SHELL=/bin/zsh $out/bin/koda completion)
  '';

  nativeInstallCheckInputs = [
    versionCheckHook
    writableTmpDirAsHomeHook
  ];
  doInstallCheck = true;
  versionCheckKeepEnvironment = [
    "HOME"
    "koda_DISABLE_MODELS_FETCH"
  ];
  versionCheckProgramArg = "--version";

  passthru = {
    jsonschema = "${placeholder "out"}/share/koda/schema.json";
  };

  meta = {
    description = "AI-powered development tool";
    homepage = "https://koda.ai/";
    license = [ lib.licenses.mit ] ++ lib.optional stdenvNoCC.hostPlatform.isLinux lib.licenses.lgpl2Plus;
    mainProgram = "koda";
    inherit (node_modules.meta) platforms;
  };
})
