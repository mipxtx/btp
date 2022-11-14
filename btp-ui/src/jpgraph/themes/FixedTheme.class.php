<?php
require_once __DIR__ . '/UniversalTheme.class.php';
/**
 * FixedTheme
 *
 * @package FixedTheme
 * @author fuse
 * @since 12.05.12 16:53
 */
class FixedTheme extends UniversalTheme
{
    function GetColorList() {
        return array(
            '#24BC14',
            '#42aaff',
            '#ff8800',

            '#8b00ff',
            '#99ff99',
            '#ff0006',

            '#4D18E4',
            '#654321',
            '#9b2d30',

            '#FF6666',
            '#66FF66',
            '#6666FF',

            // жёлтый '#FFFF66',
            '#66FFFF',
            '#FF66FF',

            '#FF6600',
            '#00FF66',
            '#6600FF',

            '#FF0066',
            '#66FF00',
            '#0066FF',

            '#AA6699',
            '#99AA66',
            '#6699AA',

            '#CC8800',
            '#00CC88',
            '#8800CC',
        );
    }
    
    /**
     * PreStrokeApply
     * @param Graph $graph
     */
    public function PreStrokeApply(Graph $graph)
    {
        if ($graph->legend->HasItems()) {
            //var_dump(count($graph->legend->txtcol));
            $margin_bottom = 30 + ceil(count($graph->legend->txtcol)/2) * 20;
            $graph->SetMargin(
                $graph->img->raw_left_margin,
                $graph->img->raw_right_margin,
                $graph->img->raw_top_margin,
                $margin_bottom
            );
            $ypos = round(1 - ($margin_bottom - 25) / $graph->img->original_height, 2);
            $graph->legend->Pos(0.05, $ypos, 'left', 'top');
            $graph->legend->SetColumns(2);
        }
    }
}
