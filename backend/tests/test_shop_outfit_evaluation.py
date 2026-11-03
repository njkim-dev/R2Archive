import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from PIL import Image

spec = importlib.util.spec_from_file_location('outfit_evaluation',Path(__file__).resolve().parents[2]/'tools/evaluate_shop_outfit_search.py')
evaluation = importlib.util.module_from_spec(spec);spec.loader.exec_module(evaluation)
REGION = {'bbox_xyxy':[100,100,900,900],'polygon_xy':[[100,100],[900,100],[900,900],[100,900]]}


class EvaluationTests(unittest.TestCase):
    def test_one_source_photograph_cannot_cross_development_and_validation(self):
        case = {'name':'a','source_group':'same-photo','split':'development','image':'local.png',
                'sex':'female','slot':'hair','expected_ids':['1'],'region':REGION}
        with TemporaryDirectory() as directory:
            path = Path(directory)/'cases.json'
            path.write_text(json.dumps({'cases':[case,{**case,'name':'b','split':'validation'}]}),encoding='utf8')
            with self.assertRaisesRegex(ValueError,'same split'):
                evaluation.load_cases(path)
            path.write_text(json.dumps({'cases':[case,{**case,'name':'b'}]}),encoding='utf8')
            rows = evaluation.load_cases(path)
            self.assertEqual(rows[0]['image'],Path(directory)/'local.png')

    def test_outline_jitter_is_repeatable_and_does_not_mutate_recorded_regions(self):
        image = Image.new('RGB',(100,200))
        _,first = evaluation.transform(image,REGION,'outline-jitter')
        _,second = evaluation.transform(image,REGION,'outline-jitter')
        self.assertEqual(first,second);self.assertNotEqual(first,REGION)
        self.assertEqual(REGION['bbox_xyxy'],[100,100,900,900])
        small,_ = evaluation.transform(image,REGION,'scale50')
        self.assertEqual(small.size,(50,100))

    def test_reference_comparison_rejects_different_inputs_or_labels(self):
        row = {'case':'one','variant':'original','source_group':'one','split':'validation','sex':'female',
               'slot':'hair','input_sha256':'a','expected_ids':['1'],'rank':None}
        report = {'stage':'cpu','catalog_revision':'v','encoder_sha256':'e','cases':[row]}
        improved = {**report,'cases':[{**row,'rank':10}]}
        self.assertEqual(evaluation.compare(report,improved)['rescued'],[{'case':'one','variant':'original','source_group':'one','split':'validation'}])
        for field,value in [('input_sha256','different'),('expected_ids',['2']),('split','development')]:
            with self.assertRaises(ValueError):
                evaluation.compare(report,{**report,'cases':[{**row,field:value}]})
        with self.assertRaises(ValueError):
            evaluation.compare(report,{**improved,'catalog_revision':'other'})

    def test_summary_counts_photographs_separately_from_transformed_queries(self):
        rows = [{'source_group':'photo','split':'validation','variant':variant,'rank':rank} for variant,rank in [('original',1),('jpeg35',None)]]
        summary = evaluation.summarize(rows)['validation']
        self.assertEqual(summary['source_groups'],1);self.assertEqual(summary['queries'],2)
        self.assertEqual(summary['hits']['120'],1);self.assertEqual(summary['misses_by_variant'],{'jpeg35':1})


if __name__=='__main__':
    unittest.main()
