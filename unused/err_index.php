<html>
    <head>
        <style>
            body {
                background: -webkit-radial-gradient(rgba(57,60,76,1), rgba(36,36,46,1) 80%);
            }
            .logoCthulhu {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(2, 2);
                width: 128px;
                height: 128px;
                transition: all 600ms cubic-bezier(0.68, -0.55, 0.265, 1.55);
            }
            .logoCthulhu #outer {
                fill: none;
                pointer-events: all;
                stroke-width: 8;
                stroke: #000000;
                transition: 1000ms;
            }
            .logoCthulhu #inner {
                fill: none;
                stroke-width: 3.5;
                stroke: #000000;
                transition: 1000ms;
            }
            .logoCthulhu #links {
                pointer-events: all;
                fill: none;
                stroke-width: 3.5;
                stroke: #000000;
                transition: 1000ms;
            }
            .logoCthulhu #link_1:hover {
                cursor: pointer;
            }
            .logoCthulhu #all:hover > g {
                stroke: #2d822d;
                transition: 1000ms;
            }
        </style>
    </head>
    <body>
        <?php echo file_get_contents("Fhtagn.svg"); ?>
        <!--<svg class="logoCthulhu" width="128" height="128" viewBox="0 0 128 128">
            <g id="all">
                <g id="outer">
                    <circle
                    cx="64"
                    cy="327.13333"
                    r="60" />
                </g>
                <g id="inner">
                    <path
                       style="stroke-linejoin:bevel;"
                       d="M 6.9366111,308.59231 H 121.06339 L 28.732875,375.67434 64,267.13333 99.267125,375.67434 Z"/>
                    <path
                       d="m 19.975767,334.21536 92.763033,2e-5 -57.064511,41.4598 21.796555,-67.08287 c 8.445674,-25.99313 19.14462,-32.65165 17.585762,-14.96081"/>
                    <path
                       d="m 117.77535,353.74557 c -5.28357,-1.71672 -6.61822,-4.68325 -14.8521,5.97847"/>
                    <path
                       d="M 108.19155,353.86413 64,267.13333 15.458977,362.40044 c 19.052314,-5.10183 34.86033,0.44681 31.686784,9.83724"/>
                </g>
                <g id="links">
                    <circle id="link_1"
                        cx="93.225082"
                       cy="295.97852"
                       r="2.9770844" />
                    <circle id="link_2"
                       cx="45.961941"
                       cy="375.04666"
                       r="2.9770844" />
                    <circle id="link_3"
                       cx="17.147339"
                       cy="334.388"
                       r="2.9770844" />
                </g>
            </g>
        </svg>-->
    </body>
</html>