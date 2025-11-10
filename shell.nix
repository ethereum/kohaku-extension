{ pkgs ? import <nixpkgs> {}}:

pkgs.mkShell {
  packages = with pkgs; [ 
    nodejs_22
    yarn   
    python314 
    libudev-zero
  ];
}